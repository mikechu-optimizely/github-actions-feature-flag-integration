#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net

/**
 * GitHub PR Comment Script
 * Posts feature flag sync report as a PR comment
 */

const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
const GITHUB_REPOSITORY = Deno.env.get('GITHUB_REPOSITORY');
const PR_NUMBER = Deno.env.get('PR_NUMBER');
const GITHUB_RUN_NUMBER = Deno.env.get('GITHUB_RUN_NUMBER');

if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER) {
  console.log('Skipping PR comment - missing required environment variables');
  Deno.exit(0);
}

const [owner, repo] = GITHUB_REPOSITORY.split('/');
const reportPath = 'reports/pr-summary.md';

try {
  // Check if report exists
  const reportContent = await Deno.readTextFile(reportPath);
  
  // GitHub API headers
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Get existing comments
  const commentsResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${PR_NUMBER}/comments`,
    { headers }
  );
  
  const comments = await commentsResponse.json();
  
  // Find existing bot comment
  const botComment = comments.find((comment: any) => 
    comment.user.type === 'Bot' && 
    comment.body.includes('<!-- feature-flag-sync-report -->')
  );

  // Create comment body
  const commentBody = `<!-- feature-flag-sync-report -->
## 🏁 Feature Flag Sync Report

${reportContent}

---
*Report generated on ${new Date().toISOString()} | Run #${GITHUB_RUN_NUMBER}*`;

  // Update or create comment
  if (botComment) {
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/comments/${botComment.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ body: commentBody })
      }
    );
    console.log('Updated existing PR comment');
  } else {
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${PR_NUMBER}/comments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: commentBody })
      }
    );
    console.log('Created new PR comment');
  }

} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    console.log('No PR summary report found at:', reportPath);
  } else {
    console.error('Error posting PR comment:', error);
    Deno.exit(1);
  }
}
