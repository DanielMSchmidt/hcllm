import { defineChain } from "@relevanceai/chain";

export default defineChain({
  title: "iterator",
  publiclyTriggerable: true,
  params: {
    previousFilesAsJson: {
      type: "string",
    },
    problemStatement: {
      type: "string",
    },
    expectations: { type: "string" },
    errors: { type: "string" },
  },
  setup({ params, step }) {
    const { problemStatement, expectations, previousFilesAsJson, errors } =
      params;

    const { answer } = step("prompt_completion", {
      system_prompt: `You are a senior cloud architect working in AWS. You have inherited a failing solution to the problem '${problemStatement}'. The junior engineer in charge had the following requirements to fulfil for this problem: '${expectations}'. He came up with this solution (every key in the JSON is a file path and every value is the contents of the file): ${previousFilesAsJson}. The solution is failing and you have been tasked with fixing it. The junior developer might have made some mistakes in the code or forgot to add files entirely. All Terraform variables except for the AWS credentials should come with sensible defaults. If a different file is required for the solution, it should be added to the JSON.`,
      prompt: `You need to solve the following Terraform errors: ${errors}. Find a solution that produces no errors on terraform apply and still solves the issue. Respond in a JSON format where the key is the relative path to the file name and the value is the contents of the file. The solution should be a valid Terraform Module and all files should be on the top level. The solution must be different from the last one and needs to address every mentioned error.`,
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
