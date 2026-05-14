using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyBudget.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AccountBaselineScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_accounts_user_id_name",
                table: "accounts");

            migrationBuilder.AddColumn<Guid>(
                name: "baseline_id",
                table: "accounts",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                """
                WITH counts AS (
                    SELECT ae.account_id AS account_id, p.baseline_id AS baseline_id, COUNT(*)::bigint AS c
                    FROM actual_entries ae
                    INNER JOIN positions p ON p.id = ae.budget_position_id
                    WHERE ae.account_id IS NOT NULL
                    GROUP BY ae.account_id, p.baseline_id
                ),
                ranked AS (
                    SELECT account_id, baseline_id, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY c DESC) AS rn
                    FROM counts
                )
                UPDATE accounts a
                SET baseline_id = r.baseline_id
                FROM ranked r
                WHERE r.account_id = a.id AND r.rn = 1;
                """);

            migrationBuilder.Sql(
                """
                UPDATE accounts a
                SET baseline_id = b.id
                FROM baselines b
                WHERE a.baseline_id IS NULL
                  AND b.user_id = a.user_id
                  AND b.is_primary_budget = TRUE
                  AND b.is_sample_demo = FALSE;
                """);

            migrationBuilder.Sql(
                """
                UPDATE accounts a
                SET baseline_id = (
                    SELECT b.id FROM baselines b
                    WHERE b.user_id = a.user_id
                    ORDER BY CASE WHEN b.is_sample_demo THEN 0 ELSE 1 END, b.created_at
                    LIMIT 1)
                WHERE a.baseline_id IS NULL;
                """);

            migrationBuilder.Sql(
                """
                UPDATE actual_entries ae
                SET account_id = NULL
                WHERE ae.account_id IS NOT NULL
                  AND EXISTS (
                      SELECT 1
                      FROM positions p
                      INNER JOIN accounts acc ON acc.id = ae.account_id
                      WHERE p.id = ae.budget_position_id
                        AND acc.baseline_id <> p.baseline_id);
                """);

            migrationBuilder.Sql("""DELETE FROM accounts WHERE baseline_id IS NULL;""");

            migrationBuilder.Sql("""ALTER TABLE accounts ALTER COLUMN baseline_id SET NOT NULL;""");

            migrationBuilder.CreateIndex(
                name: "ix_accounts_baseline_id",
                table: "accounts",
                column: "baseline_id");

            migrationBuilder.CreateIndex(
                name: "ix_accounts_baseline_id_name",
                table: "accounts",
                columns: new[] { "baseline_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_accounts_user_id",
                table: "accounts",
                column: "user_id");

            migrationBuilder.AddForeignKey(
                name: "fk_accounts_baselines_baseline_id",
                table: "accounts",
                column: "baseline_id",
                principalTable: "baselines",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_accounts_baselines_baseline_id",
                table: "accounts");

            migrationBuilder.DropIndex(
                name: "ix_accounts_baseline_id",
                table: "accounts");

            migrationBuilder.DropIndex(
                name: "ix_accounts_baseline_id_name",
                table: "accounts");

            migrationBuilder.DropIndex(
                name: "ix_accounts_user_id",
                table: "accounts");

            migrationBuilder.DropColumn(
                name: "baseline_id",
                table: "accounts");

            migrationBuilder.CreateIndex(
                name: "ix_accounts_user_id_name",
                table: "accounts",
                columns: new[] { "user_id", "name" },
                unique: true);
        }
    }
}
