Set-Location "C:\claudetest\backtesting-k"
Write-Host "=== Git Status ===" -ForegroundColor Cyan
git status

Write-Host "`n=== Git Diff Stats ===" -ForegroundColor Cyan
git diff --stat

Write-Host "`n=== Recent Commits ===" -ForegroundColor Cyan
git log --oneline -5
