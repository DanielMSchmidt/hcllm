type Config = {
  REGION: string;
  PROJECT: string;
};
const { parsed } = require("dotenv").config();
export const config = parsed as Config;
