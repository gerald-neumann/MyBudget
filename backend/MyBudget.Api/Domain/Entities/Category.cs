namespace MyBudget.Api.Domain.Entities;

public class Category
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public string? Color { get; set; }
    public bool IsSystem { get; set; }

    /// <summary>When true, planned and actual amounts for positions in this category count as income (cash in), not spending.</summary>
    public bool IsIncome { get; set; }

    public AppUser User { get; set; } = default!;
    public ICollection<BudgetPosition> BudgetPositions { get; set; } = new List<BudgetPosition>();
}
