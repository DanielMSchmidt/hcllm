import { defineChain } from "@relevanceai/chain";

export default defineChain({
  title: "Build Project",
  publiclyTriggerable: true,
  params: {
    problemStatement: {
      type: "string",
    },
    expectations: { type: "string" },
    inputs: { type: "string" },
    outputs: { type: "string" },
  },
  setup({ params, step }) {
    const { problemStatement, expectations, inputs, outputs } = params;

    const { answer } = step("prompt_completion", {
      system_prompt: `You are a cloud architect working in AWS. You are diligent and always include a README file in your projects. You use Terraform and write it as HCL. You produce well-documented Terraform Modules with just the inputs and outputs specified.`,
      prompt: `You have been tasked with designing a Terraform Module to solve this problem: ${problemStatement}. The solution must meet the following requirements: ${expectations}. The Terraform Module takes only these inputs, the parentheses denote the description: ${inputs}. These are the outputs for the module in the same format: ${outputs}. Give the solution in JSON format. The solution should be an object where keys are the relative paths of the files to be created and the value is the content of the file in HCL. The solution should be a valid Terraform Module.`,
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
