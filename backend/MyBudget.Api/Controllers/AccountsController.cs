using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("accounts")]
public class AccountsController(
    BudgetDbContext dbContext,
    IUserContext userContext) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<AccountDto>>> GetAll(CancellationToken cancellationToken)
    {
        var userId = userContext.UserId;
        var accounts = await dbContext.Accounts
            .Where(x => x.UserId == userId)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new { x.Id, x.Name, x.TypeLabel, x.InitialBalance, x.SortOrder })
            .ToListAsync(cancellationToken);

        if (accounts.Count == 0)
        {
            return Ok(Array.Empty<AccountDto>());
        }

        var ids = accounts.Select(x => x.Id).ToList();
        var deltas = await dbContext.ActualEntries
            .Where(e => e.AccountId != null && ids.Contains(e.AccountId.Value))
            .Select(e => new { Aid = e.AccountId!.Value, e.Amount, e.BudgetPosition.Category.IsIncome })
            .ToListAsync(cancellationToken);

        var deltaByAccount = deltas
            .GroupBy(x => x.Aid)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.IsIncome ? x.Amount : -x.Amount));

        var result = accounts
            .Select(a =>
            {
                var flow = deltaByAccount.GetValueOrDefault(a.Id, 0m);
                return new AccountDto(a.Id, a.Name, a.TypeLabel, a.InitialBalance, a.InitialBalance + flow, a.SortOrder);
            })
            .ToList();

        return Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<AccountDto>> Create(CreateAccountRequest request, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return BadRequest("Name is required.");
        }

        var userId = userContext.UserId;
        if (await dbContext.Accounts.AnyAsync(x => x.UserId == userId && x.Name == name, cancellationToken))
        {
            return Conflict("An account with this name already exists.");
        }

        var maxOrder = await dbContext.Accounts
            .Where(x => x.UserId == userId)
            .Select(x => (int?)x.SortOrder)
            .MaxAsync(cancellationToken) ?? 0;

        var sortOrder = request.SortOrder > 0 ? request.SortOrder : maxOrder + 1;

        var account = new Account
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = name,
            TypeLabel = string.IsNullOrWhiteSpace(request.TypeLabel) ? null : request.TypeLabel.Trim(),
            InitialBalance = request.InitialBalance,
            SortOrder = sortOrder,
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(
            nameof(GetAll),
            new AccountDto(account.Id, account.Name, account.TypeLabel, account.InitialBalance, account.InitialBalance, account.SortOrder));
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<AccountDto>> Update(Guid id, UpdateAccountRequest request, CancellationToken cancellationToken)
    {
        var account = await dbContext.Accounts.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userContext.UserId, cancellationToken);
        if (account is null)
        {
            return NotFound();
        }

        var name = request.Name.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return BadRequest("Name is required.");
        }

        if (await dbContext.Accounts.AnyAsync(
                x => x.UserId == userContext.UserId && x.Name == name && x.Id != id,
                cancellationToken))
        {
            return Conflict("An account with this name already exists.");
        }

        account.Name = name;
        account.TypeLabel = string.IsNullOrWhiteSpace(request.TypeLabel) ? null : request.TypeLabel.Trim();
        account.InitialBalance = request.InitialBalance;
        account.SortOrder = request.SortOrder;

        await dbContext.SaveChangesAsync(cancellationToken);

        var incomeSum = await dbContext.ActualEntries
            .Where(e => e.AccountId == id && e.BudgetPosition.Category.IsIncome)
            .SumAsync(e => e.Amount, cancellationToken);
        var expenseSum = await dbContext.ActualEntries
            .Where(e => e.AccountId == id && !e.BudgetPosition.Category.IsIncome)
            .SumAsync(e => e.Amount, cancellationToken);
        var flow = incomeSum - expenseSum;

        return Ok(new AccountDto(account.Id, account.Name, account.TypeLabel, account.InitialBalance, account.InitialBalance + flow, account.SortOrder));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var account = await dbContext.Accounts.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userContext.UserId, cancellationToken);
        if (account is null)
        {
            return NotFound();
        }

        if (await dbContext.ActualEntries.AnyAsync(x => x.AccountId == id, cancellationToken))
        {
            return Conflict("Cannot delete an account that has bookings. Reassign or remove actual entries first.");
        }

        dbContext.Accounts.Remove(account);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
