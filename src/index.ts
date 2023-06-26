import { Client } from "@relevanceai/chain";
import * as path from "path";
import * as fs from "fs";
import "zx/globals";
import type buildProject from "../chains/build-project";
import type iterator from "../chains/iterator";
import { config } from "./config";

// TODO: Should the files be in Redis so that next steps can prompt?

const problemStatement =
  "Build a TODO app, where users can add and remove todos and mark them as complete.";
const expectations = [
  "I can reach the TODO app from a web browser",
  "The headline says TODO app",
  "I can add a TODO and it appears in the list of TODOs",
  "I can remove a TODO and it disappears from the list of TODOs",
  "I can mark a TODO as complete and it gets a strikethrough",
  "The service needs to be reachable from the public internet",
].join(", ");

(async function () {
  const client = new Client({ region: config.REGION, project: config.PROJECT });
  //   const { answer } = await client.runChain<typeof buildProject>(
  //     "build-project",
  //     {
  //       problemStatement,
  //       expectations,
  //     }
  //   );

  // Caching to save $$$ on API calls
  const answer = `{   "code": {     "main.tf": "provider \\"aws\\" {\\n  region = \\"us-east-1\\"\\n}\\n\\nresource \\"aws_security_group\\" \\"todo_app_sg\\" {\\n  name_prefix = \\"todo_app_sg\\"\\n\\n  ingress {\\n    from_port = 80\\n    to_port = 80\\n    protocol = \\"tcp\\"\\n    cidr_blocks = [\\"0.0.0.0/0\\"]\\n  }\\n}\\n\\nresource \\"aws_instance\\" \\"todo_app_instance\\" {\\n  ami = \\"ami-0c94855ba95c71c99\\"\\n  instance_type = \\"t2.micro\\"\\n  key_name = \\"my_key_pair\\"\\n  security_groups = [aws_security_group.todo_app_sg.id]\\n\\n  connection {\\n    type = \\"ssh\\"\\n    user = \\"ubuntu\\"\\n    private_key = file(\\"~/.ssh/my_key_pair.pem\\")\\n    host = self.public_ip\\n  }\\n\\n  provisioner \\"remote-exec\\" {\\n    inline = [\\n      \\"sudo apt-get update\\",\\n      \\"sudo apt-get install -y nginx\\",\\n      \\"sudo systemctl start nginx\\",\\n      \\"sudo systemctl enable nginx\\"\\n    ]\\n  }\\n}\\n\\nresource \\"aws_lb\\" \\"todo_app_lb\\" {\\n  name_prefix = \\"todo_app_lb\\"\\n  internal = false\\n  load_balancer_type = \\"application\\"\\n  security_groups = [aws_security_group.todo_app_sg.id]\\n\\n  subnets = [\\"subnet-123456789\\", \\"subnet-987654321\\"]\\n\\n  tags = {\\n    Name = \\"todo_app_lb\\"\\n  }\\n}\\n\\nresource \\"aws_lb_target_group\\" \\"todo_app_tg\\" {\\n  name_prefix = \\"todo_app_tg\\"\\n  port = 80\\n  protocol = \\"HTTP\\"\\n  vpc_id = \\"vpc-123456789\\"\\n\\n  health_check {\\n    path = \\"/health\\"\\n    protocol = \\"HTTP\\"\\n  }\\n}\\n\\nresource \\"aws_lb_listener\\" \\"todo_app_listener\\" {\\n  load_balancer_arn = aws_lb.todo_app_lb.arn\\n  port = 80\\n  protocol = \\"HTTP\\"\\n\\n  default_action {\\n    target_group_arn = aws_lb_target_group.todo_app_tg.arn\\n    type = \\"forward\\"\\n  }\\n}\\n",     "variables.tf": "variable \\"aws_access_key\\" {}\\nvariable \\"aws_secret_key\\" {}\\nvariable \\"aws_region\\" {}\\n",     "outputs.tf": "output \\"todo_app_url\\" {\\n  value = aws_lb.todo_app_lb.dns_name\\n}"   },   "tasks": [     {       "folder": "frontend",       "prompt": "Create a React app that allows users to add and remove todos and mark them as complete."     },     {       "folder": "backend",       "prompt": "Create a RESTful API using Node.js and Express that handles requests from the frontend to add, remove, and mark todos as complete."     },     {       "folder": "terraform",       "prompt": "Write Terraform code to provision an EC2 instance running Nginx, a security group allowing inbound traffic on port 80, an Application Load Balancer, and a target group for the EC2 instance."     }   ],   "url": "http://todo-app-lb-123456789.us-east-1.elb.amazonaws.com" }`;
  const { code, tasks, url_output } = JSON.parse(answer);
  if (!code || Object.keys(code).length === 0) {
    throw new Error(`code is required from answer, got ${answer}`);
  }

  const outputDir = path.join(__dirname, "../output");
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir);

  console.log("TODO: Some AI should do the following", tasks);

  async function trySolution(code: Record<string, string>) {
    for (const [filePath, contents] of Object.entries(code)) {
      const fullPath = path.join(outputDir, filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, contents, "utf8");
    }
    cd(outputDir);

    await $`terraform init`;

    const typicalAwsEnvVars = {
      aws_access_key: process.env.AWS_ACCESS_KEY_ID,
      aws_secret_key: process.env.AWS_SECRET_ACCESS_KEY,
      aws_region: process.env.AWS_REGION || "us-east-1",
    };
    try {
      for (const [key, value] of Object.entries(typicalAwsEnvVars)) {
        process.env[`TF_VAR_${key}`] = value;
      }

      await $`terraform apply -auto-approve`;
    } finally {
      for (const key of Object.keys(typicalAwsEnvVars)) {
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
  } while (!success && count < 3);

  console.log("TODO: should run some tests against", url_output);
  // TODO: run tests
})();
