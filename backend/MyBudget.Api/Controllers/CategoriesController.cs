using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Contracts;
using MyBudget.Api.Domain.Entities;
using MyBudget.Api.Infrastructure;

namespace MyBudget.Api.Controllers;

[ApiController]
[Route("categories")]
public class CategoriesController(BudgetDbContext dbContext, IUserContext userContext) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<CategoryDto>>> GetAll(CancellationToken cancellationToken)
    {
        var items = await dbContext.Categories
            .Where(x => x.UserId == userContext.UserId)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .Select(x => new CategoryDto(x.Id, x.Name, x.SortOrder, x.Color, x.IsSystem, x.IsIncome))
            .ToListAsync(cancellationToken);

        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<CategoryDto>> Create(CreateCategoryRequest request, CancellationToken cancellationToken)
    {
        var category = new Category
        {
            Id = Guid.NewGuid(),
            UserId = userContext.UserId,
            Name = request.Name.Trim(),
            SortOrder = request.SortOrder,
            Color = request.Color,
            IsSystem = false,
            IsIncome = request.IsIncome
        };

        dbContext.Categories.Add(category);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetAll), new CategoryDto(category.Id, category.Name, category.SortOrder, category.Color, category.IsSystem, category.IsIncome));
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<CategoryDto>> Update(Guid id, UpdateCategoryRequest request, CancellationToken cancellationToken)
    {
        var category = await dbContext.Categories.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userContext.UserId, cancellationToken);
        if (category is null)
        {
            return NotFound();
        }

        category.Name = request.Name.Trim();
        category.SortOrder = request.SortOrder;
        category.Color = request.Color;
        if (request.IsIncome.HasValue)
        {
            category.IsIncome = request.IsIncome.Value;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new CategoryDto(category.Id, category.Name, category.SortOrder, category.Color, category.IsSystem, category.IsIncome));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var category = await dbContext.Categories.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userContext.UserId, cancellationToken);
        if (category is null)
        {
            return NotFound();
        }
        if (category.IsSystem)
        {
            return Conflict("System categories cannot be deleted.");
        }

        dbContext.Categories.Remove(category);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
