import { defineChain } from "@relevanceai/chain";

export default defineChain({
  title: "Build Project",
  publiclyTriggerable: true,
  params: {
    problemStatement: {
      type: "string",
    },
    expectations: { type: "string" },
  },
  setup({ params, step }) {
    const { problemStatement, expectations } = params;

    const { answer } = step("prompt_completion", {
      system_prompt: `You are a cloud architect working in AWS. You have been tasked with designing a solution to a problem. The problem is: ${problemStatement}. The solution must meet the following requirements: ${expectations}.`,
      prompt: `You are leading a team of developers to build a solution to this problem. Write Terraform configuration in HCL to solve the problem. Also list any programming jobs needed to solve the problem. The format of the solution is JSON the fields 'code' and 'tasks'. The 'code' field is an object where the key is the relative file path and the value being the contents of the file. The code field should be used for the Terraform code and if all files were put into file system they should be runnable in the current directory. The 'tasks' field is an array of objects where each object has a 'folder' and 'prompt' field. The 'directory' field is the name of the directory where the HCL code expects the application (e.g. frontend or backend) to be and the 'prompt' field is a description of the content of the directory containing all the context needed for a LLM to generate the content. The tasks field should be used as a list of tasks for the developers to complete. If the service should be reachable from the public internet include a top level field 'url_output' with the name of the output containing the address of the load balancer to the response.`,
      validators: [
        {
          _oneof_type_: "is_json",
        },
      ],
      strip_linebreaks: true,
    });

    return { answer };
  },
});
