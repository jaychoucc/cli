/**
 * Copyright 2023 Fluence Labs Limited
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
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CLIError } from "@oclif/core/lib/errors/index.js";

import {
  setCommandObjAndIsInteractive,
  type CommandObj,
} from "../src/lib/commandObj.js";
import { initFluenceConfigWithPath } from "../src/lib/configs/project/fluence.js";
import { initServiceConfig } from "../src/lib/configs/project/service.js";
import { DEFAULT_WORKER_NAME, FS_OPTIONS } from "../src/lib/const.js";
import { execPromise } from "../src/lib/execPromise.js";

import { fluence, init, maybeConcurrentTest, multiaddrs } from "./helpers.js";

const EXPECTED_TS_OR_JS_RUN_RESULT = "Hello, Fluence";

describe("integration tests", () => {
  beforeAll(() => {
    setCommandObjAndIsInteractive(
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      {
        log(msg: string) {
          console.log(msg);
        },
        error(msg: string) {
          throw new CLIError(msg);
        },
      } as CommandObj,
      false
    );
  });

  maybeConcurrentTest("should work with minimal template", async () => {
    const cwd = join("tmp", "shouldWorkWithMinimalTemplate");
    await init(cwd, "minimal");
    await addAdderServiceToFluenceYAML(cwd);

    await fluence({
      args: ["run"],
      flags: {
        f: 'helloWorld("Fluence")',
      },
      cwd,
    });

    await fluence({
      args: ["run"],
      flags: {
        f: 'helloWorld("Fluence")',
      },
      cwd,
    });
  });

  maybeConcurrentTest("should work with ts template", async () => {
    const cwd = join("tmp", "shouldWorkWithTSTemplate");
    await init(cwd, "ts");
    await addAdderServiceToFluenceYAML(cwd);
    await compileAqua(cwd);

    expect(
      (
        await execPromise({
          command: "npx",
          args: ["ts-node", getIndexJSorTSPath("ts", cwd)],
          printOutput: true,
        })
      ).trim()
    ).toBe(EXPECTED_TS_OR_JS_RUN_RESULT);
  });

  maybeConcurrentTest("should work with js template", async () => {
    const cwd = join("tmp", "shouldWorkWithJSTemplate");
    await init(cwd, "js");
    await addAdderServiceToFluenceYAML(cwd);
    await compileAqua(cwd);

    expect(
      (
        await execPromise({
          command: "node",
          args: [getIndexJSorTSPath("js", cwd)],
          printOutput: true,
        })
      ).trim()
    ).toBe(EXPECTED_TS_OR_JS_RUN_RESULT);
  });

  maybeConcurrentTest("should work without project", async () => {
    const result = await fluence({
      args: ["run"],
      flags: {
        f: "identify()",
        i: join("test", "aqua", "smoke.aqua"),
        relay: multiaddrs[0]?.multiaddr,
        quiet: true,
      },
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult).toHaveProperty("air_version");
  });

  maybeConcurrentTest(
    "should deploy workers with spell and service, resolve and run services on them",
    async () => {
      const cwd = join("tmp", "shouldDeployWorkersAndRunCodeOnThem");
      await init(cwd, "minimal");

      await writeFile(
        join(cwd, "src", "aqua", "main.aqua"),
        await readFile(
          join("test", "aqua", "runDeployedWorkers.aqua"),
          FS_OPTIONS
        ),
        FS_OPTIONS
      );

      const pathToNewServiceDir = join("src", "services", "newService");

      await fluence({
        args: ["service", "new", pathToNewServiceDir],
        cwd,
      });

      const newServiceConfig = await initServiceConfig(
        pathToNewServiceDir,
        cwd
      );

      assert(newServiceConfig !== null);
      newServiceConfig.modules.facade.envs = { A: "B" };
      await newServiceConfig.$commit();

      const pathToNewSpell = join("src", "spells", "newSpell");

      await fluence({
        args: ["spell", "new", pathToNewSpell],
        cwd,
      });

      const fluenceConfig = await initFluenceConfigWithPath(cwd);

      assert(fluenceConfig !== null);

      fluenceConfig.spells = {
        newSpell: {
          get: pathToNewSpell,
        },
      };

      assert(
        fluenceConfig.workers !== undefined &&
          fluenceConfig.workers[DEFAULT_WORKER_NAME] !== undefined &&
          fluenceConfig.hosts !== undefined &&
          fluenceConfig.hosts[DEFAULT_WORKER_NAME] !== undefined
      );

      fluenceConfig.workers[DEFAULT_WORKER_NAME].services = ["newService"];
      fluenceConfig.workers[DEFAULT_WORKER_NAME].spells = ["newSpell"];

      const peers = [
        "12D3KooWBM3SdXWqGaawQDGQ6JprtwswEg3FWGvGhmgmMez1vRbR",
        "12D3KooWQdpukY3p2DhDfUfDgphAqsGu5ZUrmQ4mcHSGrRag6gQK",
        "12D3KooWRT8V5awYdEZm6aAV9HWweCEbhWd7df4wehqHZXAB7yMZ",
      ];

      fluenceConfig.hosts[DEFAULT_WORKER_NAME].peerIds = peers;
      await fluenceConfig.$commit();

      await fluence({
        args: ["workers", "deploy"],
        cwd,
      });

      const result = await fluence({
        args: ["run"],
        flags: {
          f: "status()",
          quiet: true,
        },
        cwd,
      });

      const parsedResult = JSON.parse(result);
      assert(Array.isArray(parsedResult));

      const arrayOfResults = parsedResult
        .map((result: unknown) => {
          assert(
            typeof result === "object" &&
              result !== null &&
              "peer" in result &&
              "answer" in result &&
              typeof result.peer === "string" &&
              typeof result.answer === "string"
          );

          return {
            peer: result.peer,
            answer: result.answer,
          };
        })
        .sort(({ peer: peerA }, { peer: peerB }) => {
          if (peerA < peerB) {
            return -1;
          }

          if (peerA > peerB) {
            return 1;
          }

          return 0;
        });

      const expected = peers.map((peer) => {
        return {
          answer: "Hi, fluence",
          peer,
        };
      });

      expect(arrayOfResults).toEqual(expected);
    }
  );
});

const addAdderServiceToFluenceYAML = (cwd: string) => {
  return fluence({
    args: [
      "service",
      "add",
      "https://github.com/fluencelabs/services/blob/master/adder.tar.gz?raw=true",
    ],
    cwd,
  });
};

const compileAqua = (cwd: string) => {
  return fluence({
    args: ["aqua"],
    cwd,
  });
};

const getIndexJSorTSPath = (JSOrTs: "js" | "ts", cwd: string): string => {
  return join(cwd, "src", JSOrTs, "src", `index.${JSOrTs}`);
};