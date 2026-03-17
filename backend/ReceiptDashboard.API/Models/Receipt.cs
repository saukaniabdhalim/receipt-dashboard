namespace ReceiptDashboard.API.Models;

public class Receipt
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Date { get; set; } = string.Empty;
    public string Merchant { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
    public string? Description { get; set; }
    public string? ImageNote { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class ReceiptDto
{
    public string? Id { get; set; }
    public required string Date { get; set; }
    public required string Merchant { get; set; }
    public required string Category { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
    public string? Description { get; set; }
    public string? ImageNote { get; set; }
}
