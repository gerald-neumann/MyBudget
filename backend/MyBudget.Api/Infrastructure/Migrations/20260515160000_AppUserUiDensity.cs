using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyBudget.Api.Infrastructure;

#nullable disable

namespace MyBudget.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(BudgetDbContext))]
    [Migration("20260515160000_AppUserUiDensity")]
    public partial class AppUserUiDensity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ui_density",
                table: "users",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ui_density",
                table: "users");
        }
    }
}
