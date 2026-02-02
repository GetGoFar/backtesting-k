Set-Location "C:\claudetest\backtesting-k"

# Initialize git repository
Write-Host "Initializing git repository..." -ForegroundColor Cyan
git init

# Add all files
Write-Host "`nAdding all files..." -ForegroundColor Cyan
git add -A

# Check status
Write-Host "`nGit Status:" -ForegroundColor Cyan
git status --short

# Create commit
Write-Host "`nCreating commit..." -ForegroundColor Cyan
$commitMessage = @"
feat: optimize performance, UX, and SEO

Performance:
- Increase cache TTL to 7 days for historical fund data
- Add in-memory cache (30 min) to reduce disk reads
- Implement lazy loading for all chart components
- Charts only load when results are available

UX improvements:
- Auto-normalize portfolio weights to 100% with user warning
- Show effective date range and last data date in results
- Display warnings when data range differs from requested
- Centralize Spanish number formatting (es-ES locale)

SEO:
- Add SVG favicon with blue-indigo gradient "K"
- Add Apple touch icon
- Enhance metadata (robots, creator, canonical URL)

Technical:
- Create shared formatters utility (src/lib/formatters.ts)
- Add getDataRange() function to data-fetcher
- Add BacktestWarning type and effectiveDateRange to response
- Fix all TypeScript errors

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
"@

git commit -m $commitMessage

# Show result
Write-Host "`nCommit created:" -ForegroundColor Green
git log --oneline -1
