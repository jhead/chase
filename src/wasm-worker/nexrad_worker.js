/* @ts-self-types="./nexrad_worker.d.ts" */

import * as wasm from "./nexrad_worker_bg.wasm";
import { __wbg_set_wasm } from "./nexrad_worker_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    fetch_and_parse, init
} from "./nexrad_worker_bg.js";
