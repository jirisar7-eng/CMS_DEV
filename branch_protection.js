async function run() {
  const payload = {
    required_status_checks: {
      strict: true,
      contexts: ["validate"] // Using the job name
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      require_code_owner_reviews: true,
      required_approving_review_count: 1
    },
    restrictions: null
  };
  const res = await fetch("https://api.github.com/repos/jirisar7-eng/CMS_DEV/branches/main/protection", {
    method: "PUT",
    headers: { 
      "Authorization": `token ${process.env.GIT_TOKEN}`, 
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "node"
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 200) {
    console.log("Branch protection re-applied successfully.");
  } else {
    const err = await res.text();
    console.log("Failed to re-apply branch protection:", res.status, err);
  }
}
run();
