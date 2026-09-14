#!/bin/bash
function fetch_page() {
  local name=$1
  local id=${!name}
  echo "=== $name ==="
  curl -s -H "Authorization: Bearer $NOTION_TOKEN_CMS_DEV" -H "Notion-Version: 2022-06-28" "https://api.notion.com/v1/pages/$id"
  echo ""
}
function fetch_db() {
  local name=$1
  local id=${!name}
  echo "=== $name (DB) ==="
  curl -s -H "Authorization: Bearer $NOTION_TOKEN_CMS_DEV" -H "Notion-Version: 2022-06-28" "https://api.notion.com/v1/databases/$id"
  echo ""
}
fetch_page NOTION_CMS_ROOT_PAGE_ID
fetch_page NOTION_RULEBOOK_ROOT_ID
fetch_page NOTION_CONTRACT_REGISTRY_ID
fetch_db NOTION_CONTRACT_REGISTRY_DATA_SOURCE_ID
fetch_page NOTION_PREFLIGHT_COMMAND_PAGE_ID
fetch_page NOTION_GLOBAL_INSTRUCTIONS_PAGE_ID
fetch_page NOTION_ENV_PROFILE_PAGE_ID
