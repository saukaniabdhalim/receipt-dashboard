using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ReceiptDashboard.API.Data;
using ReceiptDashboard.API.Models;

namespace ReceiptDashboard.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReceiptsController(AppDbContext db) : ControllerBase
{
    // GET /api/receipts?month=2025-06&category=food&search=tesco&page=1&pageSize=20
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? month,
        [FromQuery] string? category,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var q = db.Receipts.AsQueryable();
        if (!string.IsNullOrEmpty(month)) q = q.Where(r => r.Date.StartsWith(month));
        if (!string.IsNullOrEmpty(category)) q = q.Where(r => r.Category == category);
        if (!string.IsNullOrEmpty(search))
            q = q.Where(r => r.Merchant.Contains(search) || (r.Description != null && r.Description.Contains(search)));

        var total = await q.CountAsync();
        var items = await q.OrderByDescending(r => r.Date)
                           .Skip((page - 1) * pageSize).Take(pageSize)
                           .ToListAsync();
        return Ok(new { total, page, pageSize, items });
    }

    // GET /api/receipts/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var r = await db.Receipts.FindAsync(id);
        return r is null ? NotFound() : Ok(r);
    }

    // POST /api/receipts
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ReceiptDto dto)
    {
        var receipt = new Receipt
        {
            Id = Guid.NewGuid().ToString(),
            Date = dto.Date,
            Merchant = dto.Merchant,
            Category = dto.Category,
            Amount = dto.Amount,
            Currency = dto.Currency,
            Description = dto.Description,
            ImageNote = dto.ImageNote,
        };
        db.Receipts.Add(receipt);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = receipt.Id }, receipt);
    }

    // POST /api/receipts/bulk  – import many at once
    [HttpPost("bulk")]
    public async Task<IActionResult> BulkImport([FromBody] List<ReceiptDto> dtos)
    {
        var receipts = dtos.Select(dto => new Receipt
        {
            Id = dto.Id ?? Guid.NewGuid().ToString(),
            Date = dto.Date,
            Merchant = dto.Merchant,
            Category = dto.Category,
            Amount = dto.Amount,
            Currency = dto.Currency,
            Description = dto.Description,
            ImageNote = dto.ImageNote,
        }).ToList();

        // upsert logic
        var existingIds = receipts.Select(r => r.Id).ToList();
        var existing = await db.Receipts.Where(r => existingIds.Contains(r.Id)).Select(r => r.Id).ToHashSetAsync();
        var toAdd = receipts.Where(r => !existing.Contains(r.Id)).ToList();
        db.Receipts.AddRange(toAdd);
        await db.SaveChangesAsync();
        return Ok(new { imported = toAdd.Count, skipped = receipts.Count - toAdd.Count });
    }

    // PUT /api/receipts/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] ReceiptDto dto)
    {
        var r = await db.Receipts.FindAsync(id);
        if (r is null) return NotFound();
        r.Date = dto.Date;
        r.Merchant = dto.Merchant;
        r.Category = dto.Category;
        r.Amount = dto.Amount;
        r.Currency = dto.Currency;
        r.Description = dto.Description;
        r.ImageNote = dto.ImageNote;
        r.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(r);
    }

    // DELETE /api/receipts/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var r = await db.Receipts.FindAsync(id);
        if (r is null) return NotFound();
        db.Receipts.Remove(r);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // GET /api/receipts/summary
    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] string? month)
    {
        var q = db.Receipts.AsQueryable();
        if (!string.IsNullOrEmpty(month)) q = q.Where(r => r.Date.StartsWith(month));

        var byCategory = await q
            .GroupBy(r => r.Category)
            .Select(g => new { category = g.Key, total = g.Sum(r => r.Amount), count = g.Count() })
            .OrderByDescending(x => x.total)
            .ToListAsync();

        var grandTotal = byCategory.Sum(x => x.total);
        return Ok(new { grandTotal, byCategory });
    }
}
