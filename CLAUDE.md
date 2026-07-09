---
project: Finance Tracker
repo: davidfontenelle80-cloud/finance-tracker
live_url: https://davidfontenelle80-cloud.github.io/finance-tracker/
local_clone: C:\Users\david\OneDrive\Documents\GitHub\finance-tracker
deploy_method: COMPOSIO GitHub API (no git bash — OneDrive .git write restriction)
tools:
  read_repo: COMPOSIO_MULTI_EXECUTE_TOOL + GITHUB_GET_REPOSITORY_CONTENT
  push_repo: COMPOSIO_MULTI_EXECUTE_TOOL + GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS
  bash_analysis: COMPOSIO_REMOTE_BASH_TOOL (parameter name is "command:", not "cmd:")
  desktop_control: mcp__computer-use__* (requires request_access first)
  web_interaction: mcp__claude-in-chrome__*
last_updated: 2026-07-09
---

# Finance Tracker — Build Rules

## What this app is
Multi-file PWA that visualizes David's House Budget Excel workbook.
The workbook is the ONLY source of truth. The app is a visualization layer — not a data-entry tool.
Live: https://davidfontenelle80-cloud.github.io/finance-tracker/

## Workbook
- Filename: `House Budget.xlsx` (NOT `House Budgetper.xlsx` — old name, do not use)
- Location: OneDrive → Accounting → House Budget.xlsx
- Bridge script: `workbook_to_json.py` (Direction A: workbook → app JSON)
- Import bridge: `excel-import-bridge.html` (Direction B: phone import)

## Architecture
- Vanilla JS, multi-file, IIFE module pattern
- State key: `financeApp_v2` in localStorage
- Firebase: optional cloud sync, lazy init
- PWA: manifest + service worker (cache-first)

## Goals
- Goals must be fully dynamic — read from "Savings Goals" sheet on every import
- On every import: completely replace state.goals — never merge, never preserve deleted goals
- Workbook is source of truth for goal names, targets, saved amounts

## Deploy rules
- NEVER run git in bash — OneDrive mount blocks .git writes
- Use COMPOSIO GitHub API to push changes
- Bump CACHE_VERSION in sw.js on every deploy
- Verify live after deploy

## Repo-first rule
Always fetch current files from GitHub before editing — local clone may be months stale.
