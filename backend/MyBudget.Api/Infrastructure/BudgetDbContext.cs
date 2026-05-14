using Microsoft.EntityFrameworkCore;
using MyBudget.Api.Domain.Entities;

namespace MyBudget.Api.Infrastructure;

public class BudgetDbContext(DbContextOptions<BudgetDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<BudgetBaseline> Baselines => Set<BudgetBaseline>();
    public DbSet<BudgetPosition> Positions => Set<BudgetPosition>();
    public DbSet<PlannedAmount> PlannedAmounts => Set<PlannedAmount>();
    public DbSet<ActualEntry> ActualEntries => Set<ActualEntry>();
    public DbSet<BaselineMember> BaselineMembers => Set<BaselineMember>();
    public DbSet<BaselineInvitation> BaselineInvitations => Set<BaselineInvitation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.DisplayName).HasMaxLength(200);
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Color).HasMaxLength(20);
            entity.Property(x => x.IsIncome).HasDefaultValue(false);
            entity.HasIndex(x => new { x.UserId, x.Name }).IsUnique();
            entity.HasOne(x => x.User).WithMany(x => x.Categories).HasForeignKey(x => x.UserId);
        });

        modelBuilder.Entity<Account>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(160);
            entity.Property(x => x.TypeLabel).HasMaxLength(80);
            entity.HasIndex(x => x.BaselineId);
            entity.HasIndex(x => new { x.BaselineId, x.Name }).IsUnique();
            entity.HasOne(x => x.User).WithMany(x => x.Accounts).HasForeignKey(x => x.UserId);
            entity.HasOne(x => x.Baseline).WithMany(x => x.Accounts).HasForeignKey(x => x.BaselineId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BudgetBaseline>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(160);
            entity.Property(x => x.Status).HasMaxLength(32);
            entity.Property(x => x.IsPrimaryBudget).HasDefaultValue(false);
            entity.Property(x => x.IsSampleDemo).HasDefaultValue(false);
            entity
                .HasIndex(x => x.UserId)
                .IsUnique()
                .HasDatabaseName("ux_baselines_user_id_primary_budget")
                .HasFilter("is_primary_budget IS TRUE");
            entity.HasOne(x => x.User).WithMany(x => x.Baselines).HasForeignKey(x => x.UserId);
            entity.HasOne(x => x.ForkedFromBaseline).WithMany(x => x.Forks).HasForeignKey(x => x.ForkedFromBaselineId);
        });

        modelBuilder.Entity<BudgetPosition>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(180);
            entity.Property(x => x.RecurrenceRuleJson).HasColumnType("jsonb");
            entity.HasOne(x => x.Baseline).WithMany(x => x.Positions).HasForeignKey(x => x.BaselineId);
            entity.HasOne(x => x.Category).WithMany(x => x.BudgetPositions).HasForeignKey(x => x.CategoryId);
            entity.HasOne(x => x.ForkedFromPosition).WithMany(x => x.Forks).HasForeignKey(x => x.ForkedFromPositionId);
        });

        modelBuilder.Entity<PlannedAmount>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasOne(x => x.BudgetPosition).WithMany(x => x.PlannedAmounts).HasForeignKey(x => x.BudgetPositionId);
            entity.HasIndex(x => new { x.BudgetPositionId, x.Year, x.Month }).IsUnique();
        });

        modelBuilder.Entity<ActualEntry>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Note).HasMaxLength(500);
            entity.Property(x => x.ExternalRef).HasMaxLength(120);
            entity.HasIndex(x => x.AccountId);
            entity.HasOne(x => x.BudgetPosition).WithMany(x => x.ActualEntries).HasForeignKey(x => x.BudgetPositionId);
            entity.HasOne(x => x.Account).WithMany(x => x.ActualEntries).HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BaselineMember>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.BaselineId, x.UserId }).IsUnique();
            entity.HasOne(x => x.Baseline).WithMany(x => x.Members).HasForeignKey(x => x.BaselineId);
            entity.HasOne(x => x.User).WithMany(x => x.BaselineMemberships).HasForeignKey(x => x.UserId);
        });

        modelBuilder.Entity<BaselineInvitation>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TokenHash).HasMaxLength(128);
            entity.HasIndex(x => x.BaselineId);
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasOne(x => x.Baseline).WithMany(x => x.Invitations).HasForeignKey(x => x.BaselineId);
            entity.HasOne(x => x.CreatedByUser)
                .WithMany(x => x.CreatedInvitations)
                .HasForeignKey(x => x.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.AcceptedByUser)
                .WithMany(x => x.AcceptedInvitations)
                .HasForeignKey(x => x.AcceptedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
