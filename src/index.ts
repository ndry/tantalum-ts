import { Tantalum } from "./Tantalum";

try {
    new Tantalum();
} catch (e: any) {
    Tantalum.fail(e.message);
    throw e;
}