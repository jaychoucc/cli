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

import assert from "node:assert";
import fsPromises from "node:fs/promises";

import { Command, Flags } from "@oclif/core";

import { initAquaCli } from "../lib/aquaCli";
import {
  AppConfig,
  DeployedServiceConfig,
  initAppConfig,
} from "../lib/configs/project/app";
import { CommandObj, NAME_ARG } from "../lib/const";
import { getMessageWithKeyValuePairs } from "../lib/helpers/getMessageWithKeyValuePairs";
import { usage } from "../lib/helpers/usage";
import { getKeyPair } from "../lib/keyPairs/getKeyPair";
import { getRelayAddr } from "../lib/multiaddr";
import { confirm } from "../lib/prompt";

export default class Remove extends Command {
  static override description = "Remove previously deployed config";
  static override examples = ["<%= config.bin %> <%= command.id %>"];
  static override flags = {
    timeout: Flags.string({
      description: "Remove timeout",
      helpValue: "<milliseconds>",
    }),
  };
  static override args = [
    { name: NAME_ARG, description: "Deployment config name" },
  ];
  static override usage: string = usage(this);
  async run(): Promise<void> {
    const { flags, args } = await this.parse(Remove);
    const nameFromArgs: unknown = args[NAME_ARG];
    assert(nameFromArgs === undefined || typeof nameFromArgs === "string");

    const appConfig = await initAppConfig(this);

    if (
      appConfig === null ||
      !(await confirm({ message: "Are you sure you want to remove your app?" }))
    ) {
      this.error("There is nothing to remove");
    }

    await removeApp({
      appConfig,
      commandObj: this,
      timeout: flags.timeout,
    });
  }
}

/**
 * Gets key-pair for stuff that user selected for removal
 * removes each service from the config
 * if all services removed successfully - it deletes app.yaml
 * otherwise it commits not removed services and throws an error
 * @param param0 { name: string; commandObj: CommandObj; timeout: string | undefined; deployedConfig: DeployedConfig;}
 * @returns Promise<void>
 */
export const removeApp = async ({
  commandObj,
  timeout,
  appConfig,
}: Readonly<{
  commandObj: CommandObj;
  timeout: string | undefined;
  appConfig: AppConfig;
}>): Promise<void> => {
  const { keyPairName, timestamp, services } = appConfig;
  const keyPair = await getKeyPair({ commandObj, keyPairName });

  if (keyPair instanceof Error) {
    commandObj.warn(
      getMessageWithKeyValuePairs(`${keyPair.message}. From config`, {
        "deployed at": timestamp,
      })
    );
    return;
  }

  const aquaCli = await initAquaCli(commandObj);
  const notRemovedServices: DeployedServiceConfig[] = [];
  for (const service of services) {
    const { serviceId, peerId, name, blueprintId } = service;
    const addr = getRelayAddr(peerId);

    try {
      // eslint-disable-next-line no-await-in-loop
      await aquaCli(
        {
          command: "remote remove_service",
          flags: {
            addr,
            id: serviceId,
            sk: keyPair.secretKey,
            on: peerId,
            timeout,
          },
        },
        `Removing service`,
        {
          name,
          id: serviceId,
          blueprintId,
          relay: addr,
          "deployed on": peerId,
          "deployed at": timestamp,
        }
      );
    } catch (error) {
      commandObj.warn(`When removing service\n${String(error)}`);
      notRemovedServices.push(service);
    }
  }

  appConfig.services = notRemovedServices;

  if (appConfig.services.length === 0) {
    return fsPromises.unlink(appConfig.$getPath());
  }

  await appConfig.$commit();
  commandObj.error(
    "Not all services were successful removed. Please make sure to remove all of them in order to continue"
  );
};