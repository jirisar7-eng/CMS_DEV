async function run() {
  const res = await fetch("https://api.github.com/repos/jirisar7-eng/CMS_DEV/actions/runs?branch=main", {
    headers: { "Authorization": `token ${process.env.GIT_TOKEN}`, "User-Agent": "node" }
  });
  const data = await res.json();
  if (data.workflow_runs && data.workflow_runs.length > 0) {
    const run = data.workflow_runs[0];
    console.log("CI_RUN_ID:", run.id);
    console.log("CI_RUN_URL:", run.html_url);
    console.log("CI_STATUS:", run.status);
    console.log("CI_CONCLUSION:", run.conclusion);
    console.log("CHECK_NAME:", run.name);
    console.log("CI_COMMIT_SHA:", run.head_sha);
  } else {
    console.log("No runs found");
  }
}
run();
