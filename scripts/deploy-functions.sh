#!/bin/bash

# Deploy the claude-search function
echo "Deploying claude-search function..."
supabase functions deploy claude-search --project-ref vsqjdfxsbgdlmihbzmcr

# Set the environment variables
echo "Setting environment variables..."
supabase secrets set CLAUDE_API_KEY="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" --project-ref vsqjdfxsbgdlmihbzmcr

echo "Deployment complete!"
