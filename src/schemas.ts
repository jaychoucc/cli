/**
 * Copyright 2022 Fluence Labs Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fsPromises from "node:fs/promises";
import path from "node:path";

import { appSchema } from "./lib/configs/project/app";
import { fluenceSchema } from "./lib/configs/project/fluence";
import { fluenceLockSchema } from "./lib/configs/project/fluenceLock";
import { moduleSchema } from "./lib/configs/project/module";
import { projectSecretsSchema } from "./lib/configs/project/projectSecrets";
import { serviceSchema } from "./lib/configs/project/service";
import { userSecretsSchema } from "./lib/configs/user/userSecrets";
import {
  APP_CONFIG_FILE_NAME,
  FLUENCE_CONFIG_FILE_NAME,
  JSON_EXT,
  YAML_EXT,
  MODULE_CONFIG_FILE_NAME,
  PROJECT_SECRETS_CONFIG_FILE_NAME,
  SCHEMAS_DIR_NAME,
  SERVICE_CONFIG_FILE_NAME,
  USER_SECRETS_CONFIG_FILE_NAME,
  FLUENCE_LOCK_CONFIG_FILE_NAME,
} from "./lib/const";
import { jsonStringify } from "./lib/helpers/jsonStringify";

const schemas = Object.entries({
  [FLUENCE_CONFIG_FILE_NAME]: fluenceSchema,
  [FLUENCE_LOCK_CONFIG_FILE_NAME]: fluenceLockSchema,
  [APP_CONFIG_FILE_NAME]: appSchema,
  [MODULE_CONFIG_FILE_NAME]: moduleSchema,
  [SERVICE_CONFIG_FILE_NAME]: serviceSchema,
  [USER_SECRETS_CONFIG_FILE_NAME]: userSecretsSchema,
  [PROJECT_SECRETS_CONFIG_FILE_NAME]: projectSecretsSchema,
});

const main = async (): Promise<void> => {
  if (process.argv[2] === "-f") {
    return fsPromises.writeFile(
      path.join("docs", "configs", "README.md"),
      `# Fluence CLI Configs

${schemas
  .map(
    ([name, schema]): string =>
      `## [${name}](./${name.replace(`.${YAML_EXT}`, "")}.md)\n\n${String(
        schema["description"]
      )}`
  )
  .join("\n")}`
    );
  }

  await fsPromises.mkdir(SCHEMAS_DIR_NAME, { recursive: true });

  await Promise.all(
    schemas.map(
      ([filename, schema]): Promise<void> =>
        fsPromises.writeFile(
          path.join(SCHEMAS_DIR_NAME, `${filename}.schema.${JSON_EXT}`),
          jsonStringify(schema)
        )
    )
  );
};

main().catch(console.error);