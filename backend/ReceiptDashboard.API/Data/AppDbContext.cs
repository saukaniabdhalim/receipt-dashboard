using Microsoft.EntityFrameworkCore;
using ReceiptDashboard.API.Models;

namespace ReceiptDashboard.API.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Receipt> Receipts { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Receipt>(e =>
        {
            e.HasKey(r => r.Id);
            e.Property(r => r.Amount).HasColumnType("decimal(18,2)");
            e.HasIndex(r => r.Date);
            e.HasIndex(r => r.Category);
        });
    }
}
