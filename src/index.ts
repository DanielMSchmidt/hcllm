import { Client } from "@relevanceai/chain";
import type helloWorldChain from "../chains/hello-world";
import { config } from "./config";

console.log({ config });
(async function () {
  const client = new Client({ region: config.REGION, project: config.PROJECT });
  const result = await client.runChain<typeof helloWorldChain>("hello-world", {
    name: "World",
  });

  console.log(result);
})();
