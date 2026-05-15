using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyBudget.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ActualEntryAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "attachment_blob_key",
                table: "actual_entries",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "attachment_content_type",
                table: "actual_entries",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "attachment_original_file_name",
                table: "actual_entries",
                type: "character varying(260)",
                maxLength: 260,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "attachment_blob_key",
                table: "actual_entries");

            migrationBuilder.DropColumn(
                name: "attachment_content_type",
                table: "actual_entries");

            migrationBuilder.DropColumn(
                name: "attachment_original_file_name",
                table: "actual_entries");
        }
    }
}
