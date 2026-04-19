using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyBudget.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StorePositionRecurrenceRuleJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "recurrence_rule_json",
                table: "positions",
                type: "jsonb",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE positions
                SET recurrence_rule_json = jsonb_build_object(
                    'cadence', CASE cadence WHEN 0 THEN 'none' WHEN 1 THEN 'monthly' WHEN 2 THEN 'yearly' END,
                    'startDate', to_char(start_date, 'YYYY-MM-DD'),
                    'endDate', end_date,
                    'defaultAmount', default_amount
                )
                WHERE recurrence_rule_json IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "recurrence_rule_json",
                table: "positions");
        }
    }
}
