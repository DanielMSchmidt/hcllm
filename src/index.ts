import { Client } from "@relevanceai/chain";
import * as path from "path";
import * as fs from "fs";
import "zx/globals";
import type buildProject from "../chains/build-project";
import type iterator from "../chains/iterator";
import { config } from "./config";

// TODO: Should the files be in Redis so that next steps can prompt?

const problemStatement =
  "Bring the static HTML at ../index.html to the public internet using AWS.";
const expectations = [
  "I can reach the website from a web browser",
  "The website is reachable from the public internet",
  "The website is served over HTTPS",
].join("; ");
const inputs = {
  aws_region: "The AWS region to deploy to",
  aws_access_key_id: "The AWS access key ID",
  aws_secret_access_key: "The AWS secret access key",
  path_to_static_html: "The path to the static HTML file",
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
      inputs: mapToString(inputs),
      outputs: mapToString(outputs),
    }
  );

  console.log(answer);

  // Caching to save $$$ on API calls
  //   const answer = `{   "code": {     "main.tf": "provider \\"aws\\" {\\n  region = \\"us-east-1\\"\\n}\\n\\nresource \\"aws_security_group\\" \\"todo_app_sg\\" {\\n  name_prefix = \\"todo_app_sg\\"\\n\\n  ingress {\\n    from_port = 80\\n    to_port = 80\\n    protocol = \\"tcp\\"\\n    cidr_blocks = [\\"0.0.0.0/0\\"]\\n  }\\n}\\n\\nresource \\"aws_instance\\" \\"todo_app_instance\\" {\\n  ami = \\"ami-0c94855ba95c71c99\\"\\n  instance_type = \\"t2.micro\\"\\n  key_name = \\"my_key_pair\\"\\n  security_groups = [aws_security_group.todo_app_sg.id]\\n\\n  connection {\\n    type = \\"ssh\\"\\n    user = \\"ubuntu\\"\\n    private_key = file(\\"~/.ssh/my_key_pair.pem\\")\\n    host = self.public_ip\\n  }\\n\\n  provisioner \\"remote-exec\\" {\\n    inline = [\\n      \\"sudo apt-get update\\",\\n      \\"sudo apt-get install -y nginx\\",\\n      \\"sudo systemctl start nginx\\",\\n      \\"sudo systemctl enable nginx\\"\\n    ]\\n  }\\n}\\n\\nresource \\"aws_lb\\" \\"todo_app_lb\\" {\\n  name_prefix = \\"todo_app_lb\\"\\n  internal = false\\n  load_balancer_type = \\"application\\"\\n  security_groups = [aws_security_group.todo_app_sg.id]\\n\\n  subnets = [\\"subnet-123456789\\", \\"subnet-987654321\\"]\\n\\n  tags = {\\n    Name = \\"todo_app_lb\\"\\n  }\\n}\\n\\nresource \\"aws_lb_target_group\\" \\"todo_app_tg\\" {\\n  name_prefix = \\"todo_app_tg\\"\\n  port = 80\\n  protocol = \\"HTTP\\"\\n  vpc_id = \\"vpc-123456789\\"\\n\\n  health_check {\\n    path = \\"/health\\"\\n    protocol = \\"HTTP\\"\\n  }\\n}\\n\\nresource \\"aws_lb_listener\\" \\"todo_app_listener\\" {\\n  load_balancer_arn = aws_lb.todo_app_lb.arn\\n  port = 80\\n  protocol = \\"HTTP\\"\\n\\n  default_action {\\n    target_group_arn = aws_lb_target_group.todo_app_tg.arn\\n    type = \\"forward\\"\\n  }\\n}\\n",     "variables.tf": "variable \\"aws_access_key\\" {}\\nvariable \\"aws_secret_key\\" {}\\nvariable \\"aws_region\\" {}\\n",     "outputs.tf": "output \\"todo_app_url\\" {\\n  value = aws_lb.todo_app_lb.dns_name\\n}"   },   "tasks": [     {       "folder": "frontend",       "prompt": "Create a React app that allows users to add and remove todos and mark them as complete."     },     {       "folder": "backend",       "prompt": "Create a RESTful API using Node.js and Express that handles requests from the frontend to add, remove, and mark todos as complete."     },     {       "folder": "terraform",       "prompt": "Write Terraform code to provision an EC2 instance running Nginx, a security group allowing inbound traffic on port 80, an Application Load Balancer, and a target group for the EC2 instance."     }   ],   "url": "http://todo-app-lb-123456789.us-east-1.elb.amazonaws.com" }`;
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
    for (const [filePath, contents] of Object.entries(code)) {
      const fullPath = path.join(outputDir, filePath);
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

    await $`terraform init`;

    try {
      for (const [key, value] of Object.entries(inputs)) {
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
