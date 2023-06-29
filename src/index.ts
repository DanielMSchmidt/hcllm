import { Client } from "@relevanceai/chain";
import * as path from "path";
import * as fs from "fs";
import "zx/globals";
import type buildProject from "../chains/build-project";
import type iterator from "../chains/iterator";
import { config } from "./config";

// TODO: Should the files be in Redis so that next steps can prompt?

const problemStatement =
  "Host a docker image passed in as input on a public URL";
const expectations = [
  "I can reach the docker image from a web browser",
  "The website is reachable from the public internet",
  "The website is served over HTTPS",
  "The docker image exposes port 80",
].join("; ");
const exampleUsage = `
module "nginx-docker-image" {
    source  = "./module"

    aws_region = "us-east-1"
    aws_access_key_id = var.aws_access_key_id
    aws_secret_access_key = var.aws_secret_access_key
    docker_image = "nginx:latest"
}
`;

const inputs = {
  aws_region: "The AWS region to deploy to",
  aws_access_key_id: "The AWS access key ID",
  aws_secret_access_key: "The AWS secret access key",
  docker_image: "The Docker image to use ",
};
const outputs = {
  public_url: "The public URL of the website",
};

function mapToString(map: Record<string, string>) {
  return Object.entries(map)
    .map(([name, description]) => `${name} (${description})`)
    .join(", ");
}

(async function () {
  // Verify all inputs are present
  for (const input of Object.keys(inputs)) {
    if (!process.env[input.toLocaleUpperCase()]) {
      throw new Error(
        `Missing input '${input.toLocaleUpperCase()}', could not be found in env var`
      );
    }
  }

  const client = new Client({ region: config.REGION, project: config.PROJECT });
  const { answer } = await client.runChain<typeof buildProject>(
    "build-project",
    {
      problemStatement,
      expectations,
      exampleUsage,
      inputs: mapToString(inputs),
      outputs: mapToString(outputs),
    }
  );

  const code = JSON.parse(answer);
  if (!code || Object.keys(code).length === 0) {
    throw new Error(`code is required from answer, got ${answer}`);
  }

  const outputDir = path.join(__dirname, "../output");
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir);

  async function trySolution(code: Record<string, string | Object>) {
    const moduleDir = path.join(outputDir, "module");
    if (fs.existsSync(moduleDir)) {
      fs.rmSync(moduleDir, { recursive: true });
    }
    fs.mkdirSync(moduleDir);

    for (const [filePath, contents] of Object.entries(code)) {
      const fullPath = path.join(moduleDir, filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        fullPath,
        typeof contents === "string" ? contents : JSON.stringify(contents),
        "utf8"
      );
    }
    cd(outputDir);

    fs.writeFileSync(path.resolve(outputDir, "main.tf"), exampleUsage, "utf8");

    await $`terraform init`;

    try {
      for (const key of Object.keys(inputs)) {
        process.env[`TF_VAR_${key}`] = process.env[key.toLocaleUpperCase()];
      }

      await $`terraform apply -auto-approve`;
    } finally {
      for (const key of Object.keys(inputs)) {
        process.env[`TF_VAR_${key}`] = undefined;
      }
    }
  }

  let codeToTry = code;
  let count = 0;
  let success = false;
  do {
    count++;

    try {
      await trySolution(codeToTry);
      console.log("trySolution succeeded");
      success = true;
    } catch (e) {
      console.error(`trySolution errored: ${e}`);
      success = false;
      try {
        const { answer } = await client.runChain<typeof iterator>("iterator", {
          problemStatement,
          expectations,
          errors: String(e),
          previousFilesAsJson: JSON.stringify(codeToTry),
        });
        console.log("Iterating with answer", answer);
        codeToTry = JSON.parse(answer);
      } catch (e) {
        console.error(`iterator errored: ${e}`);
        success = false;
      }
    }
  } while (!success && count < 10);

  if (!success) {
    throw new Error("Failed to find a solution");
  } else {
    console.log("Found a solution");
  }
})();
