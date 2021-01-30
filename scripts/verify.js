const fs = require("fs");
const path = require("path");

const Ajv = require("ajv").default;
const Codeowners = require("codeowners");

const { getAddress } = require("@ethersproject/address");

const SchemasDirectory = "./schema/";
const DataDirectory = "./data/";
const IndexName = "index.json";

function loadValidators(schemaDir) {
  const ajv = new Ajv();
  const validators = {};
  for (let name of fs.readdirSync(schemaDir)) {
    const file = path.join(schemaDir, name);
    const type = path.parse(file).name;
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) continue;
    try {
      const schema = JSON.parse(fs.readFileSync(file, "utf-8"));
      validators[type] = ajv.compile(schema);
    } catch (error) {
      console.error(`Error: "${file}" is not a valid schema.`);
      process.exit(1);
    }
  }
  return validators;
}

function validate(directory, validators) {
  const codeowners = new Codeowners();
  let allValid = true;
  for (let name of fs.readdirSync(directory)) {
    if (name.startsWith(".") || name === IndexName) continue;
    const file = path.join(directory, name);
    const type = path.parse(file).name;
    const stat = fs.lstatSync(file);
    if (stat.isFile() && validators[type]) {
      const validator = validators[type];
      let data;
      try {
        data = JSON.parse(fs.readFileSync(file, "utf-8"));
      } catch {
        console.error(`Error: "${file}" is not a valid JSON file.`);
        continue;
      }
      const valid = validator(data);
      if (!valid) {
        console.error(`Error: "${file}" does not follow "${name}" schema:`);
        for (const error of validator.errors) {
          console.log(` - ${error.message}`);
        }
        allValid = false;
      }
    } else if (stat.isDirectory()) {
      if (name.startsWith("0x")) {
        try {
          if (getAddress(name) !== name) {
            console.error(`Error: "${name}" is not checksummed. ("${file}")`);
            allValid = false;
          }
        } catch {
          console.error(`Error: "${name}" is not a valid address. ("${file}")`);
          allValid = false;
        }
      }
      allValid &= validate(file, validators);
    }
    const owners = codeowners.getOwner(file);
    if (owners.length === 0) {
      console.error(`Error: "${file}" has no codeowners.`);
      allValid = false;
    }
  }
  return allValid;
}

function verify(schemaDir, dataDir) {
  const validators = loadValidators(schemaDir);
  const valid = validate(dataDir, validators);
  if (!valid) process.exit(1);
}

const cwd = process.cwd();
if (!fs.existsSync(path.join(cwd, ".git"))) {
  console.error("Error: script should be run in the root of the repo.");
  process.exit(1);
}

try {
  verify(SchemasDirectory, DataDirectory);
  console.log("Ok: all files match schema definitions!");
} catch (error) {
  console.error(error);
  process.exit(1);
}
