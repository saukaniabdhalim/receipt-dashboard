using Microsoft.EntityFrameworkCore;
using ReceiptDashboard.API.Data;

var builder = WebApplication.CreateBuilder(args);

// SQLite DB – stores receipts.db in app folder
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Data Source=receipts.db"));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Resit Dashboard API", Version = "v1" });
});

// CORS – allow the GitHub Pages frontend URL and localhost dev
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
{
    p.WithOrigins(
        "http://localhost:5173",
        "http://localhost:3000",
        builder.Configuration["AllowedOrigin"] ?? "https://YOUR_USERNAME.github.io"
    )
    .AllowAnyHeader()
    .AllowAnyMethod();
}));

var app = builder.Build();

// Auto-create DB on start
using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    ctx.Database.EnsureCreated();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthorization();
app.MapControllers();

app.Run();
