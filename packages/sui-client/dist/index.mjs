var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/index.ts
export * from "@mysten/sui/client";
export * from "@mysten/sui/utils";
export * from "@mysten/sui/transactions";
export * from "@mysten/sui/bcs";
export * from "@mysten/sui/keypairs/ed25519";
export * from "@mysten/sui/keypairs/secp256k1";
export * from "@mysten/sui/keypairs/secp256r1";
import { bcs as bcs4, BcsType as BcsType2 } from "@mysten/bcs";

// src/dubhe.ts
import keccak256 from "keccak256";
import { Transaction as Transaction2 } from "@mysten/sui/transactions";
import { fromHex as fromHex2, toHex as toHex2, bcs as bcs3 } from "@mysten/bcs";

// src/libs/suiAccountManager/index.ts
import { Ed25519Keypair as Ed25519Keypair2 } from "@mysten/sui/keypairs/ed25519";

// src/libs/suiAccountManager/keypair.ts
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
var getDerivePathForSUI = (derivePathParams = {}) => {
  const { accountIndex = 0, isExternal = false, addressIndex = 0 } = derivePathParams;
  return `m/44'/784'/${accountIndex}'/${isExternal ? 1 : 0}'/${addressIndex}'`;
};
var getKeyPair = (mnemonics, derivePathParams = {}) => {
  const derivePath = getDerivePathForSUI(derivePathParams);
  return Ed25519Keypair.deriveKeypair(mnemonics, derivePath);
};

// src/libs/suiAccountManager/util.ts
import { fromB64 } from "@mysten/sui/utils";
var isHex = (str) => /^0x[0-9a-fA-F]+$|^[0-9a-fA-F]+$/.test(str);
var isBase64 = (str) => /^[a-zA-Z0-9+/]+={0,2}$/g.test(str);
var fromHEX = (hexStr) => {
  if (!hexStr) {
    throw new Error("cannot parse empty string to Uint8Array");
  }
  const intArr = hexStr.replace("0x", "").match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16));
  if (!intArr || intArr.length === 0) {
    throw new Error(`Unable to parse HEX: ${hexStr}`);
  }
  return Uint8Array.from(intArr);
};
var hexOrBase64ToUint8Array = (str) => {
  if (isHex(str)) {
    return fromHEX(str);
  } else if (isBase64(str)) {
    return fromB64(str);
  } else {
    throw new Error("The string is not a valid hex or base64 string.");
  }
};
var PRIVATE_KEY_SIZE = 32;
var LEGACY_PRIVATE_KEY_SIZE = 64;
var normalizePrivateKey = (key) => {
  if (key.length === LEGACY_PRIVATE_KEY_SIZE) {
    key = key.slice(0, PRIVATE_KEY_SIZE);
  } else if (key.length === PRIVATE_KEY_SIZE + 1 && key[0] === 0) {
    return key.slice(1);
  } else if (key.length === PRIVATE_KEY_SIZE) {
    return key;
  }
  throw new Error("invalid secret key");
};

// src/libs/suiAccountManager/crypto.ts
import { generateMnemonic as genMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
var generateMnemonic = (numberOfWords = 24) => {
  const strength = numberOfWords === 12 ? 128 : 256;
  return genMnemonic(wordlist, strength);
};

// src/libs/suiAccountManager/index.ts
import { SUI_PRIVATE_KEY_PREFIX, decodeSuiPrivateKey } from "@mysten/sui/cryptography";
var SuiAccountManager = class {
  /**
   * Support the following ways to init the SuiToolkit:
   * 1. mnemonics
   * 2. secretKey (base64 or hex)
   * If none of them is provided, will generate a random mnemonics with 24 words.
   *
   * @param mnemonics, 12 or 24 mnemonics words, separated by space
   * @param secretKey, base64 or hex string or Bech32 string, when mnemonics is provided, secretKey will be ignored
   */
  constructor({ mnemonics, secretKey } = {}) {
    this.mnemonics = mnemonics || "";
    this.secretKey = secretKey || "";
    if (!this.mnemonics && !this.secretKey) {
      this.mnemonics = generateMnemonic(24);
    }
    this.currentKeyPair = this.secretKey ? this.parseSecretKey(this.secretKey) : getKeyPair(this.mnemonics);
    this.currentAddress = this.currentKeyPair.getPublicKey().toSuiAddress();
  }
  /**
   * Check if the secretKey starts with bench32 format
   */
  parseSecretKey(secretKey) {
    if (secretKey.startsWith(SUI_PRIVATE_KEY_PREFIX)) {
      const { secretKey: uint8ArraySecretKey } = decodeSuiPrivateKey(secretKey);
      return Ed25519Keypair2.fromSecretKey(normalizePrivateKey(uint8ArraySecretKey));
    }
    return Ed25519Keypair2.fromSecretKey(normalizePrivateKey(hexOrBase64ToUint8Array(secretKey)));
  }
  /**
   * if derivePathParams is not provided or mnemonics is empty, it will return the currentKeyPair.
   * else:
   * it will generate keyPair from the mnemonic with the given derivePathParams.
   */
  getKeyPair(derivePathParams) {
    if (!derivePathParams || !this.mnemonics)
      return this.currentKeyPair;
    return getKeyPair(this.mnemonics, derivePathParams);
  }
  /**
   * if derivePathParams is not provided or mnemonics is empty, it will return the currentAddress.
   * else:
   * it will generate address from the mnemonic with the given derivePathParams.
   */
  getAddress(derivePathParams) {
    if (!derivePathParams || !this.mnemonics)
      return this.currentAddress;
    return getKeyPair(this.mnemonics, derivePathParams).getPublicKey().toSuiAddress();
  }
  /**
   * Switch the current account with the given derivePathParams.
   * This is only useful when the mnemonics is provided. For secretKey mode, it will always use the same account.
   */
  switchAccount(derivePathParams) {
    if (this.mnemonics) {
      this.currentKeyPair = getKeyPair(this.mnemonics, derivePathParams);
      this.currentAddress = this.currentKeyPair.getPublicKey().toSuiAddress();
    }
  }
};

// src/libs/suiTxBuilder/index.ts
import { Transaction } from "@mysten/sui/transactions";
import { SUI_SYSTEM_STATE_OBJECT_ID } from "@mysten/sui/utils";

// src/libs/suiTxBuilder/util.ts
import {
  normalizeSuiObjectId,
  normalizeSuiAddress,
  isValidSuiObjectId,
  isValidSuiAddress
} from "@mysten/sui/utils";
import { Inputs, getPureBcsSchema } from "@mysten/sui/transactions";
import { SerializedBcs, bcs, isSerializedBcs } from "@mysten/bcs";
var getDefaultSuiInputType = (value) => {
  if (typeof value === "string" && isValidSuiObjectId(value)) {
    return "object";
  } else if (typeof value === "number" || typeof value === "bigint") {
    return "u64";
  } else if (typeof value === "boolean") {
    return "bool";
  } else {
    return void 0;
  }
};
function makeVecParam(txBlock, args, type) {
  if (args.length === 0)
    throw new Error("Transaction builder error: Empty array is not allowed");
  const defaultSuiType = getDefaultSuiInputType(args[0]);
  const VECTOR_REGEX = /^vector<(.+)>$/;
  const STRUCT_REGEX = /^([^:]+)::([^:]+)::([^<]+)(<(.+)>)?/;
  type = type || defaultSuiType;
  if (type === "object") {
    const elements = args.map(
      (arg) => typeof arg === "string" && isValidSuiObjectId(arg) ? txBlock.object(normalizeSuiObjectId(arg)) : convertObjArg(txBlock, arg)
    );
    return txBlock.makeMoveVec({ elements });
  } else if (typeof type === "string" && !VECTOR_REGEX.test(type) && !STRUCT_REGEX.test(type)) {
    const bcsSchema = getPureBcsSchema(type);
    return txBlock.pure(bcs.vector(bcsSchema).serialize(args));
  } else {
    const elements = args.map((arg) => convertObjArg(txBlock, arg));
    return txBlock.makeMoveVec({ elements, type });
  }
}
function isMoveVecArg(arg) {
  if (typeof arg === "object" && "vecType" in arg && "value" in arg) {
    return true;
  } else if (Array.isArray(arg)) {
    return true;
  }
  return false;
}
function convertArgs(txBlock, args) {
  return args.map((arg) => {
    if (arg instanceof SerializedBcs || isSerializedBcs(arg)) {
      return txBlock.pure(arg);
    }
    if (isMoveVecArg(arg)) {
      const vecType = "vecType" in arg;
      return vecType ? makeVecParam(txBlock, arg.value, arg.vecType) : makeVecParam(txBlock, arg);
    }
    return arg;
  });
}
function convertAddressArg(txBlock, arg) {
  if (typeof arg === "string" && isValidSuiAddress(arg)) {
    return txBlock.pure.address(normalizeSuiAddress(arg));
  } else {
    return convertArgs(txBlock, [arg])[0];
  }
}
function convertObjArg(txb, arg) {
  if (typeof arg === "string") {
    return txb.object(arg);
  }
  if ("digest" in arg && "version" in arg && "objectId" in arg) {
    return txb.objectRef(arg);
  }
  if ("objectId" in arg && "initialSharedVersion" in arg && "mutable" in arg) {
    return txb.sharedObjectRef(arg);
  }
  if ("Object" in arg) {
    if ("ImmOrOwnedObject" in arg.Object) {
      return txb.object(Inputs.ObjectRef(arg.Object.ImmOrOwnedObject));
    } else if ("SharedObject" in arg.Object) {
      return txb.object(Inputs.SharedObjectRef(arg.Object.SharedObject));
    } else {
      throw new Error("Invalid argument type");
    }
  }
  if (typeof arg === "function") {
    return arg;
  }
  if ("GasCoin" in arg || "Input" in arg || "Result" in arg || "NestedResult" in arg) {
    return arg;
  }
  throw new Error("Invalid argument type");
}
function convertAmounts(txBlock, amounts) {
  return amounts.map((amount) => {
    if (typeof amount === "number" || typeof amount === "bigint") {
      return amount;
    } else {
      return convertArgs(txBlock, [amount])[0];
    }
  });
}

// src/libs/suiTxBuilder/index.ts
var SuiTx = class {
  constructor(transaction) {
    if (transaction !== void 0) {
      this.tx = Transaction.from(transaction);
    } else {
      this.tx = new Transaction();
    }
  }
  /* Directly wrap methods and properties of TransactionBlock */
  get gas() {
    return this.tx.gas;
  }
  get blockData() {
    return this.tx.blockData;
  }
  address(value) {
    return this.tx.pure.address(value);
  }
  get pure() {
    return this.tx.pure;
  }
  object(value) {
    return this.tx.object(value);
  }
  objectRef(ref) {
    return this.tx.objectRef(ref);
  }
  sharedObjectRef(ref) {
    return this.tx.sharedObjectRef(ref);
  }
  setSender(sender) {
    return this.tx.setSender(sender);
  }
  setSenderIfNotSet(sender) {
    return this.tx.setSenderIfNotSet(sender);
  }
  setExpiration(expiration) {
    return this.tx.setExpiration(expiration);
  }
  setGasPrice(price) {
    return this.tx.setGasPrice(price);
  }
  setGasBudget(budget) {
    return this.tx.setGasBudget(budget);
  }
  setGasOwner(owner) {
    return this.tx.setGasOwner(owner);
  }
  setGasPayment(payments) {
    return this.tx.setGasPayment(payments);
  }
  serialize() {
    return this.tx.serialize();
  }
  toJSON() {
    return this.tx.toJSON();
  }
  sign(params) {
    return this.tx.sign(params);
  }
  build(params = {}) {
    return this.tx.build(params);
  }
  getDigest(params = {}) {
    return this.tx.getDigest(params);
  }
  add(...args) {
    return this.tx.add(...args);
  }
  publish({ modules, dependencies }) {
    return this.tx.publish({ modules, dependencies });
  }
  upgrade(...args) {
    return this.tx.upgrade(...args);
  }
  makeMoveVec(...args) {
    return this.tx.makeMoveVec(...args);
  }
  /* Override methods of TransactionBlock */
  transferObjects(objects, address) {
    return this.tx.transferObjects(
      objects.map((object) => convertObjArg(this.tx, object)),
      convertAddressArg(this.tx, address)
    );
  }
  splitCoins(coin, amounts) {
    const res = this.tx.splitCoins(convertObjArg(this.tx, coin), convertAmounts(this.tx, amounts));
    return amounts.map((_, i) => res[i]);
  }
  mergeCoins(destination, sources) {
    const destinationObject = convertObjArg(this.tx, destination);
    const sourceObjects = sources.map((source) => convertObjArg(this.tx, source));
    return this.tx.mergeCoins(destinationObject, sourceObjects);
  }
  /**
   * @description Move call
   * @param target `${string}::${string}::${string}`, e.g. `0x3::sui_system::request_add_stake`
   * @param args the arguments of the move call, such as `['0x1', '0x2']`
   * @param typeArgs the type arguments of the move call, such as `['0x2::sui::SUI']`
   */
  moveCall(target, args = [], typeArgs = []) {
    const regex = /(?<package>[a-zA-Z0-9]+)::(?<module>[a-zA-Z0-9_]+)::(?<function>[a-zA-Z0-9_]+)/;
    const match = target.match(regex);
    if (match === null)
      throw new Error("Invalid target format. Expected `${string}::${string}::${string}`");
    const convertedArgs = convertArgs(this.tx, args);
    return this.tx.moveCall({
      target,
      arguments: convertedArgs,
      typeArguments: typeArgs
    });
  }
  /* Enhance methods of TransactionBlock */
  transferSuiToMany(recipients, amounts) {
    if (recipients.length !== amounts.length) {
      throw new Error("transferSuiToMany: recipients.length !== amounts.length");
    }
    const coins = this.tx.splitCoins(
      this.tx.gas,
      amounts.map(
        (amount) => typeof amount === "number" || typeof amount === "bigint" ? amount : convertArgs(this.tx, [amount])[0]
      )
    );
    const recipientObjects = recipients.map((recipient) => convertAddressArg(this.tx, recipient));
    recipientObjects.forEach((address, index) => {
      this.tx.transferObjects([coins[index]], address);
    });
    return this;
  }
  transferSui(address, amount) {
    return this.transferSuiToMany([address], [amount]);
  }
  takeAmountFromCoins(coins, amount) {
    const coinObjects = coins.map((coin) => convertObjArg(this.tx, coin));
    const mergedCoin = coinObjects[0];
    if (coins.length > 1) {
      this.tx.mergeCoins(mergedCoin, coinObjects.slice(1));
    }
    const [sendCoin] = this.tx.splitCoins(mergedCoin, convertAmounts(this.tx, [amount]));
    return [sendCoin, mergedCoin];
  }
  splitSUIFromGas(amounts) {
    return this.tx.splitCoins(this.tx.gas, convertAmounts(this.tx, amounts));
  }
  splitMultiCoins(coins, amounts) {
    const coinObjects = coins.map((coin) => convertObjArg(this.tx, coin));
    const mergedCoin = coinObjects[0];
    if (coins.length > 1) {
      this.tx.mergeCoins(mergedCoin, coinObjects.slice(1));
    }
    const splitedCoins = this.tx.splitCoins(mergedCoin, convertAmounts(this.tx, amounts));
    return { splitedCoins, mergedCoin };
  }
  transferCoinToMany(coins, sender, recipients, amounts) {
    if (recipients.length !== amounts.length) {
      throw new Error("transferSuiToMany: recipients.length !== amounts.length");
    }
    const coinObjects = coins.map((coin) => convertObjArg(this.tx, coin));
    const { splitedCoins, mergedCoin } = this.splitMultiCoins(coinObjects, amounts);
    const recipientObjects = recipients.map((recipient) => convertAddressArg(this.tx, recipient));
    recipientObjects.forEach((address, index) => {
      this.tx.transferObjects([splitedCoins[index]], address);
    });
    this.tx.transferObjects([mergedCoin], convertAddressArg(this.tx, sender));
    return this;
  }
  transferCoin(coins, sender, recipient, amount) {
    return this.transferCoinToMany(coins, sender, [recipient], [amount]);
  }
  stakeSui(amount, validatorAddr) {
    const [stakeCoin] = this.tx.splitCoins(this.tx.gas, convertAmounts(this.tx, [amount]));
    return this.tx.moveCall({
      target: "0x3::sui_system::request_add_stake",
      arguments: convertArgs(this.tx, [
        this.tx.object(SUI_SYSTEM_STATE_OBJECT_ID),
        stakeCoin,
        convertAddressArg(this.tx, validatorAddr)
      ])
    });
  }
};

// src/libs/suiInteractor/suiInteractor.ts
import { SuiClient } from "@mysten/sui/client";
import { requestSuiFromFaucetV0, getFaucetHost } from "@mysten/sui/faucet";

// src/libs/suiModel/suiOwnedObject.ts
var SuiOwnedObject = class {
  constructor(param) {
    this.objectId = param.objectId;
    this.version = param.version;
    this.digest = param.digest;
  }
  /**
   * Check if the object is fully initialized.
   * So that when it's used as an input, it won't be necessary to fetch from fullnode again.
   * Which can save time when sending transactions.
   */
  isFullObject() {
    return !!this.version && !!this.digest;
  }
  asCallArg() {
    if (!this.version || !this.digest) {
      return this.objectId;
    }
    return {
      $kind: "Object",
      Object: {
        $kind: "ImmOrOwnedObject",
        ImmOrOwnedObject: {
          objectId: this.objectId,
          version: this.version,
          digest: this.digest
        }
      }
    };
  }
  /**
   * Update object version & digest based on the transaction response.
   * @param txResponse
   */
  updateFromTxResponse(txResponse) {
    const changes = txResponse.objectChanges;
    if (!changes) {
      throw new Error("Bad transaction response!");
    }
    for (const change of changes) {
      if (change.type === "mutated" && change.objectId === this.objectId) {
        this.digest = change.digest;
        this.version = change.version;
        return;
      }
    }
    throw new Error("Could not find object in transaction response!");
  }
};

// src/libs/suiModel/suiSharedObject.ts
var SuiSharedObject = class {
  constructor(param) {
    this.objectId = param.objectId;
    this.initialSharedVersion = param.initialSharedVersion;
  }
  asCallArg(mutable = false) {
    if (!this.initialSharedVersion) {
      return this.objectId;
    }
    return {
      $kind: "Object",
      Object: {
        $kind: "SharedObject",
        SharedObject: {
          objectId: this.objectId,
          initialSharedVersion: this.initialSharedVersion,
          mutable
        }
      }
    };
  }
};

// src/libs/suiInteractor/util.ts
var delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// src/libs/suiInteractor/suiInteractor.ts
var SuiInteractor = class {
  constructor(fullNodeUrls, network) {
    if (fullNodeUrls.length === 0)
      throw new Error("fullNodeUrls must not be empty");
    this.fullNodes = fullNodeUrls;
    this.clients = fullNodeUrls.map((url) => new SuiClient({ url }));
    this.currentFullNode = fullNodeUrls[0];
    this.currentClient = this.clients[0];
    this.network = network;
  }
  switchToNextClient() {
    const currentClientIdx = this.clients.indexOf(this.currentClient);
    this.currentClient = this.clients[(currentClientIdx + 1) % this.clients.length];
    this.currentFullNode = this.fullNodes[(currentClientIdx + 1) % this.clients.length];
  }
  async sendTx(transactionBlock, signature) {
    const txResOptions = {
      showEvents: true,
      showEffects: true,
      showObjectChanges: true,
      showBalanceChanges: true
    };
    for (const clientIdx in this.clients) {
      try {
        return await this.clients[clientIdx].executeTransactionBlock({
          transactionBlock,
          signature,
          options: txResOptions
        });
      } catch (err) {
        console.warn(
          `Failed to send transaction with fullnode ${this.fullNodes[clientIdx]}: ${err}`
        );
        await delay(2e3);
      }
    }
    throw new Error("Failed to send transaction with all fullnodes");
  }
  async waitForTransaction({
    digest,
    timeout = 60 * 1e3,
    pollInterval = 2 * 1e3
  }) {
    for (const clientIdx in this.clients) {
      try {
        const txResOptions = {
          showEvents: true,
          showEffects: true,
          showObjectChanges: true,
          showBalanceChanges: true
        };
        return await this.clients[clientIdx].waitForTransaction({
          digest,
          timeout,
          pollInterval,
          options: txResOptions
        });
      } catch (err) {
        console.warn(
          `Failed to wait for transaction with fullnode ${this.fullNodes[clientIdx]}: ${err}`
        );
        await delay(2e3);
      }
    }
    throw new Error("Failed to wait for transaction with all fullnodes");
  }
  async getObjects(ids, options) {
    const opts = options ?? {
      showContent: true,
      showDisplay: true,
      showType: true,
      showOwner: true
    };
    for (const clientIdx in this.clients) {
      try {
        const objects = await this.clients[clientIdx].multiGetObjects({
          ids,
          options: opts
        });
        const parsedObjects = objects.map((object) => {
          return object.data;
        }).filter((object) => object !== null && object !== void 0);
        return parsedObjects;
      } catch (err) {
        await delay(2e3);
        console.warn(`Failed to get objects with fullnode ${this.fullNodes[clientIdx]}: ${err}`);
      }
    }
    throw new Error("Failed to get objects with all fullnodes");
  }
  async getObject(id) {
    const objects = await this.getObjects([id]);
    return objects[0];
  }
  async getDynamicFieldObject(parentId, name) {
    for (const clientIdx in this.clients) {
      try {
        return await this.clients[clientIdx].getDynamicFieldObject({
          parentId,
          name
        });
      } catch (err) {
        await delay(2e3);
        console.warn(
          `Failed to get DynamicFieldObject with fullnode ${this.fullNodes[clientIdx]}: ${err}`
        );
      }
    }
    throw new Error("Failed to get DynamicFieldObject with all fullnodes");
  }
  async getDynamicFields(parentId, cursor, limit) {
    for (const clientIdx in this.clients) {
      try {
        return await this.clients[clientIdx].getDynamicFields({
          parentId,
          cursor,
          limit
        });
      } catch (err) {
        await delay(2e3);
        console.warn(
          `Failed to get DynamicFields with fullnode ${this.fullNodes[clientIdx]}: ${err}`
        );
      }
    }
    throw new Error("Failed to get DynamicFields with all fullnodes");
  }
  async getTxDetails(digest) {
    for (const clientIdx in this.clients) {
      try {
        const txResOptions = {
          showEvents: true,
          showEffects: true,
          showObjectChanges: true,
          showBalanceChanges: true
        };
        return await this.clients[clientIdx].getTransactionBlock({
          digest,
          options: txResOptions
        });
      } catch (err) {
        await delay(2e3);
        console.warn(
          `Failed to get TransactionBlocks with fullnode ${this.fullNodes[clientIdx]}: ${err}`
        );
      }
    }
    throw new Error("Failed to get TransactionBlocks with all fullnodes");
  }
  async getOwnedObjects(owner, cursor, limit) {
    for (const clientIdx in this.clients) {
      try {
        return await this.clients[clientIdx].getOwnedObjects({
          owner,
          cursor,
          limit
        });
      } catch (err) {
        await delay(2e3);
        console.warn(
          `Failed to get OwnedObjects with fullnode ${this.fullNodes[clientIdx]}: ${err}`
        );
      }
    }
    throw new Error("Failed to get OwnedObjects with all fullnodes");
  }
  async getNormalizedMoveModulesByPackage(packageId) {
    for (const clientIdx in this.clients) {
      try {
        return await this.clients[clientIdx].getNormalizedMoveModulesByPackage({
          package: packageId
        });
      } catch (err) {
        await delay(2e3);
        console.warn(
          `Failed to get NormalizedMoveModules with fullnode ${this.fullNodes[clientIdx]}: ${err}`
        );
      }
    }
    throw new Error("Failed to get NormalizedMoveModules with all fullnodes");
  }
  /**
   * @description Update objects in a batch
   * @param suiObjects
   */
  async updateObjects(suiObjects) {
    const objectIds = suiObjects.map((obj) => obj.objectId);
    const objects = await this.getObjects(objectIds);
    for (const object of objects) {
      const suiObject = suiObjects.find((obj) => obj.objectId === object?.objectId);
      if (suiObject instanceof SuiSharedObject) {
        if (object.owner && typeof object.owner === "object" && "Shared" in object.owner) {
          suiObject.initialSharedVersion = object.owner.Shared.initial_shared_version;
        } else {
          suiObject.initialSharedVersion = void 0;
        }
      } else if (suiObject instanceof SuiOwnedObject) {
        suiObject.version = object?.version;
        suiObject.digest = object?.digest;
      }
    }
  }
  /**
   * @description Select coins that add up to the given amount.
   * @param addr the address of the owner
   * @param amount the amount that is needed for the coin
   * @param coinType the coin type, default is '0x2::SUI::SUI'
   */
  async selectCoins(addr, amount, coinType = "0x2::SUI::SUI") {
    const selectedCoins = [];
    let totalAmount = 0;
    let hasNext = true, nextCursor = null;
    while (hasNext && totalAmount < amount) {
      const coins = await this.currentClient.getCoins({
        owner: addr,
        coinType,
        cursor: nextCursor
      });
      coins.data.sort((a, b) => parseInt(b.balance) - parseInt(a.balance));
      for (const coinData of coins.data) {
        selectedCoins.push({
          objectId: coinData.coinObjectId,
          digest: coinData.digest,
          version: coinData.version,
          balance: coinData.balance
        });
        totalAmount = totalAmount + parseInt(coinData.balance);
        if (totalAmount >= amount) {
          break;
        }
      }
      nextCursor = coins.nextCursor;
      hasNext = coins.hasNextPage;
    }
    if (!selectedCoins.length) {
      throw new Error("No valid coins found for the transaction.");
    }
    return selectedCoins;
  }
  /**
   * @description Select owned objects with objectType.
   * @param addr the address of the owner
   * @param objectType the coin type, default is '0x2::SUI::SUI'
   */
  async selectObjects(addr, objectType) {
    const selectedObjects = [];
    let hasNext = true, nextCursor = null;
    while (hasNext) {
      const ownedObjects = await this.currentClient.getOwnedObjects({
        owner: addr,
        cursor: nextCursor
      });
      for (const objectData of ownedObjects.data) {
        const objectDetail = await this.getObject(objectData.data.objectId);
        if (objectDetail.type === objectType) {
          selectedObjects.push(objectDetail);
        }
      }
      nextCursor = ownedObjects.nextCursor;
      hasNext = ownedObjects.hasNextPage;
    }
    if (!selectedObjects.length) {
      throw new Error("Not own this object found for the transaction.");
    }
    return selectedObjects;
  }
  async requestFaucet(address, network) {
    await requestSuiFromFaucetV0({
      host: getFaucetHost(network),
      recipient: address
    });
  }
};

// src/libs/suiInteractor/defaultConfig.ts
var getDefaultURL = (networkType = "testnet") => {
  switch (networkType) {
    case "localnet":
      return {
        fullNode: "http://127.0.0.1:9000",
        graphql: "http://127.0.0.1:9125",
        network: "localnet",
        txExplorer: "https://explorer.polymedia.app/txblock/:txHash?network=local",
        accountExplorer: "https://explorer.polymedia.app/address/:address?network=local",
        explorer: "https://explorer.polymedia.app?network=local",
        indexerUrl: "http://127.0.0.1:3001"
      };
    case "devnet":
      return {
        fullNode: "https://fullnode.devnet.sui.io:443",
        network: "devnet",
        txExplorer: "https://suiscan.xyz/devnet/tx/:txHash",
        accountExplorer: "https://suiscan.xyz/devnet/address/:address",
        explorer: "https://suiscan.xyz/devnet",
        indexerUrl: "http://127.0.0.1:3001"
      };
    case "testnet":
      return {
        fullNode: "https://fullnode.testnet.sui.io:443",
        graphql: "https://sui-testnet.mystenlabs.com/graphql",
        network: "testnet",
        txExplorer: "https://suiscan.xyz/testnet/tx/:txHash",
        accountExplorer: "https://suiscan.xyz/testnet/address/:address",
        explorer: "https://suiscan.xyz/testnet",
        indexerUrl: "http://127.0.0.1:3001"
      };
    case "mainnet":
      return {
        fullNode: "https://fullnode.mainnet.sui.io:443",
        graphql: "https://sui-mainnet.mystenlabs.com/graphql",
        network: "mainnet",
        txExplorer: "https://suiscan.xyz/mainnet/tx/:txHash",
        accountExplorer: "https://suiscan.xyz/mainnet/address/:address",
        explorer: "https://suiscan.xyz/mainnet",
        indexerUrl: "http://127.0.0.1:3001"
      };
    default:
      return {
        fullNode: "https://fullnode.testnet.sui.io:443",
        graphql: "https://sui-testnet.mystenlabs.com/graphql",
        network: "testnet",
        txExplorer: "https://suiscan.xyz/testnet/tx/:txHash",
        accountExplorer: "https://suiscan.xyz/testnet/address/:address",
        explorer: "https://suiscan.xyz/testnet",
        indexerUrl: "http://127.0.0.1:3001"
      };
  }
};

// src/libs/suiContractFactory/index.ts
var SuiContractFactory = class {
  // readonly #query: MapMessageQuery<ApiTypes> = {};
  // readonly #tx: MapMessageTx<ApiTypes> = {};
  /**
   * Support the following ways to init the SuiToolkit:
   * 1. mnemonics
   * 2. secretKey (base64 or hex)
   * If none of them is provided, will generate a random mnemonics with 24 words.
   *
   * @param mnemonics, 12 or 24 mnemonics words, separated by space
   * @param secretKey, base64 or hex string, when mnemonics is provided, secretKey will be ignored
   */
  constructor({ packageId, metadata } = {}) {
    this.packageId = packageId || "";
    this.metadata = metadata || void 0;
  }
  getFuncByModuleName(_moduleName) {
    Object.values(this.metadata).forEach((value) => {
      const data = value;
      console.log(`moudle name: ${data.name}`);
      Object.entries(data.exposedFunctions).forEach(([key, value2]) => {
        console.log(`	func name: ${key}`);
        Object.values(value2.parameters).forEach((_values) => {
        });
      });
    });
  }
  getAllFunc() {
    Object.values(this.metadata).forEach((value) => {
      const data = value;
      console.log(`moudle name: ${data.name}`);
      Object.entries(data.exposedFunctions).forEach(([key, value2]) => {
        console.log(`	func name: ${key}`);
        console.log(`		${value2.parameters.length}`);
        Object.values(value2.parameters).forEach((values) => {
          console.log(`		args: ${values}`);
        });
      });
    });
  }
  getAllModule() {
    Object.values(this.metadata).forEach((value, index) => {
      const data = value;
      console.log(`${index}. ${data.name}`);
    });
  }
  //   async call(arguments: ({
  //     kind: "Input";
  //     index: number;
  //     type?: "object" | "pure" | undefined;
  //     value?: any;
  // } | {
  //     kind: "GasCoin";
  // } | {
  //     kind: "Result";
  //     index: number;
  // } | {
  //     kind: "NestedResult";
  //     index: number;
  //     resultIndex: number;
  // })[], derivePathParams?: DerivePathParams) {
  //     const tx = new TransactionBlock();
  //     tx.moveCall({
  //       target: `${this.packageId}::${}::${}`,
  //       arguments,
  //     })
  //     return ;
  //   }
};

// src/utils/const.ts
import { fromHex, toHex, bcs as bcs2 } from "@mysten/bcs";
var BasicBcsTypes = {
  address: bcs2.bytes(32).transform({
    // To change the input type, you need to provide a type definition for the input
    input: (val) => fromHex(val),
    output: (val) => toHex(val)
  }),
  u8: bcs2.u8(),
  u16: bcs2.u16(),
  u32: bcs2.u32(),
  u64: bcs2.u64(),
  u128: bcs2.u128(),
  u256: bcs2.u256(),
  bool: bcs2.bool(),
  "0x1::ascii::String": bcs2.string(),
  "0x1::string::String": bcs2.string(),
  "0x1::option::Option<address>": bcs2.option(
    bcs2.bytes(32).transform({
      // To change the input type, you need to provide a type definition for the input
      input: (val) => fromHex(val),
      output: (val) => toHex(val)
    })
  ),
  "0x1::option::Option<u8>": bcs2.option(bcs2.u8()),
  "0x1::option::Option<u16>": bcs2.option(bcs2.u16()),
  "0x1::option::Option<u32>": bcs2.option(bcs2.u32()),
  "0x1::option::Option<u64>": bcs2.option(bcs2.u64()),
  "0x1::option::Option<u128>": bcs2.option(bcs2.u128()),
  "0x1::option::Option<u256>": bcs2.option(bcs2.u256()),
  "0x1::option::Option<bool>": bcs2.option(bcs2.bool()),
  "0x1::option::Option<vector<address>>": bcs2.option(
    bcs2.vector(
      bcs2.bytes(32).transform({
        // To change the input type, you need to provide a type definition for the input
        input: (val) => fromHex(val),
        output: (val) => toHex(val)
      })
    )
  ),
  "0x1::option::Option<vector<u8>>": bcs2.option(bcs2.vector(bcs2.u8())),
  "0x1::option::Option<vector<u16>>": bcs2.option(bcs2.vector(bcs2.u16())),
  "0x1::option::Option<vector<u32>>": bcs2.option(bcs2.vector(bcs2.u32())),
  "0x1::option::Option<vector<u64>>": bcs2.option(bcs2.vector(bcs2.u64())),
  "0x1::option::Option<vector<u128>>": bcs2.option(bcs2.vector(bcs2.u128())),
  "0x1::option::Option<vector<u256>>": bcs2.option(bcs2.vector(bcs2.u256())),
  "0x1::option::Option<vector<bool>>": bcs2.option(bcs2.vector(bcs2.bool())),
  "vector<address>": bcs2.vector(
    bcs2.bytes(32).transform({
      // To change the input type, you need to provide a type definition for the input
      input: (val) => fromHex(val),
      output: (val) => toHex(val)
    })
  ),
  "vector<u8>": bcs2.vector(bcs2.u8()),
  "vector<u16>": bcs2.vector(bcs2.u16()),
  "vector<u32>": bcs2.vector(bcs2.u32()),
  "vector<u64>": bcs2.vector(bcs2.u64()),
  "vector<u128>": bcs2.vector(bcs2.u128()),
  "vector<u256>": bcs2.vector(bcs2.u256()),
  "vector<bool>": bcs2.vector(bcs2.bool()),
  "vector<vector<address>>": bcs2.vector(
    bcs2.vector(
      bcs2.bytes(32).transform({
        // To change the input type, you need to provide a type definition for the input
        input: (val) => fromHex(val),
        output: (val) => toHex(val)
      })
    )
  ),
  "vector<vector<u8>>": bcs2.vector(bcs2.vector(bcs2.u8())),
  "vector<vector<u16>>": bcs2.vector(bcs2.vector(bcs2.u16())),
  "vector<vector<u32>>": bcs2.vector(bcs2.vector(bcs2.u32())),
  "vector<vector<u64>>": bcs2.vector(bcs2.vector(bcs2.u64())),
  "vector<vector<u128>>": bcs2.vector(bcs2.vector(bcs2.u128())),
  "vector<vector<u256>>": bcs2.vector(bcs2.vector(bcs2.u256())),
  "vector<vector<bool>>": bcs2.vector(bcs2.vector(bcs2.bool())),
  "0x2::coin::Coin<T>": bcs2.struct("Coin", {
    id: bcs2.fixedArray(32, bcs2.u8()).transform({
      input: (id) => fromHex(id),
      output: (id) => toHex(Uint8Array.from(id))
    }),
    balance: bcs2.struct("Balance", {
      value: bcs2.u64()
    })
  }),
  "0x2::balance::Balance<T>": bcs2.struct("Balance", {
    value: bcs2.u64()
  })
};

// src/utils/index.ts
function normalizeHexAddress(input) {
  const hexRegex = /^(0x)?[0-9a-fA-F]{64}$/;
  if (hexRegex.test(input)) {
    if (input.startsWith("0x")) {
      return input;
    } else {
      return "0x" + input;
    }
  } else {
    return null;
  }
}
function numberToAddressHex(num) {
  const hex = num.toString(16);
  const paddedHex = "0x" + hex.padStart(64, "0");
  return paddedHex;
}
function normalizePackageId(input) {
  const withPrefix = input.startsWith("0x") ? input : "0x" + input;
  const withoutPrefix = withPrefix.slice(2);
  const normalized = withoutPrefix.replace(/^0+/, "");
  return "0x" + normalized;
}

// src/errors/index.ts
var ContractDataParsingError = class extends Error {
  constructor(dryResult) {
    const error = dryResult?.effects?.status?.error || "";
    const functionMatch = error ? error.match(/function_name: Some\("([^"]+)"\)/) : null;
    const moduleMatch = error ? error.match(/address: ([a-fA-F0-9]+)/) : null;
    const functionName = functionMatch ? functionMatch[1] : "unknown";
    const moduleAddress = moduleMatch ? "0x" + moduleMatch[1] : "unknown";
    const errorMessage = dryResult.error ? dryResult.error : "UNKNOWN_ERROR";
    const message = [
      `
- Function: ${functionName}`,
      `- Module Address: ${moduleAddress}`,
      `- Error Message: ${errorMessage}`
    ].join("\n");
    super(message);
    this.errorType = "ContractDataParsingError";
    this.functionName = functionName;
    this.moduleAddress = moduleAddress;
    this.errorMessage = errorMessage;
  }
};

// src/dubhe.ts
function isUndefined(value) {
  return value === void 0;
}
function withMeta(meta, creator) {
  creator.meta = meta;
  return creator;
}
function createQuery(meta, fn) {
  return withMeta(
    meta,
    async ({
      tx,
      params,
      typeArguments,
      isRaw
    }) => {
      const result = await fn(tx, params, typeArguments, isRaw);
      return result;
    }
  );
}
function createTx(meta, fn) {
  return withMeta(
    meta,
    async ({
      tx,
      params,
      typeArguments,
      isRaw,
      onSuccess,
      onError
    }) => {
      return await fn(tx, params, typeArguments, isRaw, onSuccess, onError);
    }
  );
}
var _query, _tx, _object, _exec, _read, _getVectorDepth, _bcs, _bcsenum, _processKeyParameter, processKeyParameter_fn, _defaultDappKey, defaultDappKey_fn, _buildChannelTableKey, buildChannelTableKey_fn, _detectChannelChain, detectChannelChain_fn, _buildChannelSubmitPayload, buildChannelSubmitPayload_fn, _channelPost, channelPost_fn, _channelSubscribe, channelSubscribe_fn;
var Dubhe = class {
  /**
   * Support the following ways to init the DubheClient:
   * 1. mnemonics
   * 2. secretKey (base64 or hex)
   * If none of them is provided, will generate a random mnemonics with 24 words.
   *
   * @param mnemonics, 12 or 24 mnemonics words, separated by space
   * @param secretKey, base64 or hex string or bech32, when mnemonics is provided, secretKey will be ignored
   * @param networkType, 'testnet' | 'mainnet' | 'devnet' | 'localnet', default is 'devnet'
   * @param fullnodeUrl, the fullnode url, default is the preconfig fullnode url for the given network type
   * @param packageId
   */
  constructor({
    mnemonics,
    secretKey,
    networkType,
    fullnodeUrls,
    channelUrl,
    indexerUrl,
    packageId,
    metadata
  } = {}) {
    // async getTransactions({
    //   first,
    //   after,
    //   sender,
    //   digest,
    //   checkpoint,
    //   packageId,
    //   module,
    //   functionName,
    //   orderBy,
    //   showEvent,
    // }: {
    //   first?: number;
    //   after?: string;
    //   sender?: string;
    //   digest?: string;
    //   checkpoint?: number;
    //   packageId?: string;
    //   module?: string;
    //   functionName?: string[];
    //   orderBy?: string[];
    //   showEvent?: boolean;
    // }): Promise<ConnectionResponse<IndexerTransaction>> {
    //   return await this.suiIndexerClient.getTransactions({
    //     first,
    //     after,
    //     sender,
    //     digest,
    //     checkpoint,
    //     packageId,
    //     module,
    //     functionName,
    //     orderBy,
    //     showEvent,
    //   });
    // }
    // async getTransaction(
    //   digest: string
    // ): Promise<IndexerTransaction | undefined> {
    //   return await this.suiIndexerClient.getTransaction(digest);
    // }
    // /**
    //  * Wait for the transaction to be processed by the indexer and return all transaction-related data
    //  * @param digest transaction digest
    //  * @param options option parameters
    //  * @returns result object containing transaction, events and schema data
    //  */
    // async waitForIndexerTransaction(
    //   digest: string,
    //   options?: {
    //     checkInterval?: number;
    //     timeout?: number;
    //     maxRetries?: number;
    //     pageSize?: number;
    //   }
    // ): Promise<IndexerTransactionResult> {
    //   const {
    //     checkInterval = 100,
    //     timeout = 30000,
    //     maxRetries = 300,
    //     pageSize = 100,
    //   } = options ?? {};
    //   const startTime = Date.now();
    //   let retryCount = 0;
    //   while (retryCount < maxRetries) {
    //     try {
    //       if (Date.now() - startTime > timeout) {
    //         throw new Error(`Waiting for transaction ${digest} timed out`);
    //       }
    //       await new Promise((resolve) => setTimeout(resolve, checkInterval));
    //       const tx = await this.getTransaction(digest);
    //       if (tx) {
    //         const events: IndexerEvent[] = [];
    //         const schemaChanges: IndexerSchema[] = [];
    //         let hasNextEventsPage = true;
    //         let eventsCursor: string | undefined;
    //         while (hasNextEventsPage) {
    //           const eventsResponse = await this.getEvents({
    //             digest,
    //             first: pageSize,
    //             after: eventsCursor,
    //           });
    //           events.push(...eventsResponse.edges.map((edge) => edge.node));
    //           hasNextEventsPage = eventsResponse.pageInfo.hasNextPage;
    //           eventsCursor = eventsResponse.pageInfo.endCursor;
    //         }
    //         let hasNextSchemasPage = true;
    //         let schemasCursor: string | undefined;
    //         while (hasNextSchemasPage) {
    //           const schemasResponse = await this.getStorage({
    //             last_update_digest: digest,
    //             first: pageSize,
    //             after: schemasCursor,
    //           });
    //           schemaChanges.push(...schemasResponse.data);
    //           hasNextSchemasPage = schemasResponse.pageInfo.hasNextPage;
    //           schemasCursor = schemasResponse.pageInfo.endCursor;
    //         }
    //         return {
    //           tx,
    //           events,
    //           schemaChanges,
    //         };
    //       }
    //       retryCount++;
    //     } catch (error) {
    //       throw new Error(
    //         `Error while waiting for transaction ${digest}: ${error}`
    //       );
    //     }
    //   }
    //   throw new Error(
    //     `Reached maximum retries (${maxRetries}), failed to wait for transaction ${digest}`
    //   );
    // }
    // async getEvents({
    //   first,
    //   after,
    //   names,
    //   sender,
    //   digest,
    //   checkpoint,
    //   orderBy,
    // }: {
    //   first?: number;
    //   after?: string;
    //   names?: string[];
    //   sender?: string;
    //   digest?: string;
    //   checkpoint?: string;
    //   orderBy?: string[];
    // }): Promise<ConnectionResponse<IndexerEvent>> {
    //   return await this.suiIndexerClient.getEvents({
    //     first,
    //     after,
    //     names,
    //     sender,
    //     digest,
    //     checkpoint,
    //     orderBy,
    //   });
    // }
    // async getSchemas({
    //   name,
    //   key1,
    //   key2,
    //   is_removed,
    //   last_update_checkpoint,
    //   last_update_digest,
    //   value,
    //   first,
    //   after,
    //   orderBy,
    //   jsonOrderBy,
    // }: {
    //   name?: string;
    //   key1?: any;
    //   key2?: any;
    //   is_removed?: boolean;
    //   last_update_checkpoint?: string;
    //   last_update_digest?: string;
    //   value?: any;
    //   first?: number;
    //   after?: string;
    //   orderBy?: string[];
    //   jsonOrderBy?: JsonPathOrder[];
    // }): Promise<ConnectionResponse<IndexerSchema>> {
    //   return await this.suiIndexerClient.getSchemas({
    //     name,
    //     key1,
    //     key2,
    //     is_removed,
    //     last_update_checkpoint,
    //     last_update_digest,
    //     value,
    //     first,
    //     after,
    //     orderBy,
    //     jsonOrderBy,
    //   });
    // }
    // async getStorage({
    //   name,
    //   key1,
    //   key2,
    //   is_removed,
    //   last_update_checkpoint,
    //   last_update_digest,
    //   value,
    //   first,
    //   after,
    //   orderBy,
    //   jsonOrderBy,
    // }: {
    //   name?: string;
    //   key1?: any;
    //   key2?: any;
    //   is_removed?: boolean;
    //   last_update_checkpoint?: string;
    //   last_update_digest?: string;
    //   value?: any;
    //   first?: number;
    //   after?: string;
    //   orderBy?: string[];
    //   jsonOrderBy?: JsonPathOrder[];
    // }): Promise<StorageResponse<IndexerSchema>> {
    //   return await this.suiIndexerClient.getStorage({
    //     name,
    //     key1,
    //     key2,
    //     is_removed,
    //     last_update_checkpoint,
    //     last_update_digest,
    //     value,
    //     first,
    //     after,
    //     orderBy,
    //     jsonOrderBy,
    //   });
    // }
    // async getStorageItem({
    //   name,
    //   key1,
    //   key2,
    //   is_removed,
    //   last_update_checkpoint,
    //   last_update_digest,
    //   value,
    // }: {
    //   name: string;
    //   key1?: any;
    //   key2?: any;
    //   is_removed?: boolean;
    //   last_update_checkpoint?: string;
    //   last_update_digest?: string;
    //   value?: any;
    // }): Promise<StorageItemResponse<IndexerSchema> | undefined> {
    //   const response = await this.suiIndexerClient.getStorageItem({
    //     name,
    //     key1,
    //     key2,
    //     is_removed,
    //     last_update_checkpoint,
    //     last_update_digest,
    //     value,
    //   });
    //   return response;
    // }
    // async subscribe({
    //   types,
    //   handleData,
    //   onOpen,
    //   onClose,
    // }: {
    //   types: SubscribableType[];
    //   handleData: (data: any) => void;
    //   onOpen?: () => void;
    //   onClose?: () => void;
    // }): Promise<WebSocket> {
    //   return this.suiIndexerClient.subscribe({
    //     types,
    //     handleData,
    //     onOpen,
    //     onClose,
    //   });
    // }
    __privateAdd(this, _processKeyParameter);
    __privateAdd(this, _defaultDappKey);
    __privateAdd(this, _buildChannelTableKey);
    __privateAdd(this, _detectChannelChain);
    __privateAdd(this, _buildChannelSubmitPayload);
    __privateAdd(this, _channelPost);
    __privateAdd(this, _channelSubscribe);
    __privateAdd(this, _query, {});
    __privateAdd(this, _tx, {});
    __privateAdd(this, _object, BasicBcsTypes);
    __privateAdd(this, _exec, async (meta, tx, params, typeArguments, isRaw, onSuccess, onError) => {
      if (isRaw === true) {
        return tx.moveCall({
          target: `${this.contractFactory.packageId}::${meta.moduleName}::${meta.funcName}`,
          arguments: params,
          typeArguments
        });
      }
      tx.moveCall({
        target: `${this.contractFactory.packageId}::${meta.moduleName}::${meta.funcName}`,
        arguments: params,
        typeArguments
      });
      return await this.signAndSendTxn({ tx, onSuccess, onError });
    });
    __privateAdd(this, _read, async (meta, tx, params, typeArguments, isRaw) => {
      if (isRaw === true) {
        return tx.moveCall({
          target: `${this.contractFactory.packageId}::${meta.moduleName}::${meta.funcName}`,
          arguments: params,
          typeArguments
        });
      }
      tx.moveCall({
        target: `${this.contractFactory.packageId}::${meta.moduleName}::${meta.funcName}`,
        arguments: params,
        typeArguments
      });
      return await this.inspectTxn(tx);
    });
    __privateAdd(this, _getVectorDepth, (field) => {
      if (typeof field === "object" && "Vector" in field) {
        return 1 + __privateGet(this, _getVectorDepth).call(this, field.Vector);
      }
      return 0;
    });
    __privateAdd(this, _bcs, (bcsmeta) => {
      let loopFlag = false;
      const bcsJson = {};
      Object.entries(bcsmeta.objectType.fields).forEach(([_index, type]) => {
        const objName = type.name;
        const objType = type.type;
        switch (typeof objType) {
          case "object":
            for (const [key, value] of Object.entries(objType)) {
              switch (key) {
                case "Struct":
                  const structType = value;
                  if (structType.address === "0x1" && structType.module === "ascii" && structType.name === "String") {
                    bcsJson[objName] = bcs3.string();
                    return;
                  } else if (structType.address === "0x2" && structType.module === "object" && structType.name === "UID") {
                    bcsJson[objName] = bcs3.fixedArray(32, bcs3.u8()).transform({
                      input: (id) => fromHex2(id),
                      output: (id) => toHex2(Uint8Array.from(id))
                    });
                    return;
                  } else if (structType.address === "0x2" && structType.module === "object" && structType.name === "ID") {
                    bcsJson[objName] = bcs3.fixedArray(32, bcs3.u8()).transform({
                      input: (id) => fromHex2(id),
                      output: (id) => toHex2(Uint8Array.from(id))
                    });
                    return;
                  } else if (structType.address === "0x2" && structType.module === "bag" && structType.name === "Bag") {
                    bcsJson[objName] = bcs3.fixedArray(32, bcs3.u8()).transform({
                      input: (id) => fromHex2(id),
                      output: (id) => toHex2(Uint8Array.from(id))
                    });
                    return;
                  } else if (structType.address === "0x1" && structType.module === "option" && structType.name === "Option") {
                    switch (structType.typeArguments[0]) {
                      case "U8":
                        bcsJson[objName] = bcs3.option(bcs3.u8());
                        return;
                      case "U16":
                        bcsJson[objName] = bcs3.option(bcs3.u16());
                        return;
                      case "U32":
                        bcsJson[objName] = bcs3.option(bcs3.u32());
                        return;
                      case "U64":
                        bcsJson[objName] = bcs3.option(bcs3.u64());
                        return;
                      case "U128":
                        bcsJson[objName] = bcs3.option(bcs3.u128());
                        return;
                      case "U256":
                        bcsJson[objName] = bcs3.option(bcs3.u256());
                        return;
                      case "Bool":
                        bcsJson[objName] = bcs3.option(bcs3.bool());
                        return;
                      case "Address":
                        bcsJson[objName] = bcs3.option(
                          bcs3.bytes(32).transform({
                            // To change the input type, you need to provide a type definition for the input
                            input: (val) => fromHex2(val),
                            output: (val) => toHex2(val)
                          })
                        );
                        return;
                      default:
                    }
                  } else {
                    if (this.object[`${structType.address}::${structType.module}::${structType.name}`] === void 0) {
                      loopFlag = true;
                    } else {
                      bcsJson[objName] = this.object[`${structType.address}::${structType.module}::${structType.name}`];
                      return;
                    }
                  }
                  return;
                case "Vector":
                  if (typeof value === "string") {
                    switch (value) {
                      case "U8":
                        bcsJson[objName] = bcs3.vector(bcs3.u8());
                        return;
                      case "U16":
                        bcsJson[objName] = bcs3.vector(bcs3.u16());
                        return;
                      case "U32":
                        bcsJson[objName] = bcs3.vector(bcs3.u32());
                        return;
                      case "U64":
                        bcsJson[objName] = bcs3.vector(bcs3.u64());
                        return;
                      case "U128":
                        bcsJson[objName] = bcs3.vector(bcs3.u128());
                        return;
                      case "U256":
                        bcsJson[objName] = bcs3.vector(bcs3.u256());
                        return;
                      case "Bool":
                        bcsJson[objName] = bcs3.vector(bcs3.bool());
                        return;
                      case "Address":
                        bcsJson[objName] = bcs3.vector(
                          bcs3.bytes(32).transform({
                            // To change the input type, you need to provide a type definition for the input
                            input: (val) => fromHex2(val),
                            output: (val) => toHex2(val)
                          })
                        );
                        return;
                      default:
                    }
                  }
                  if (typeof value === "object") {
                    const vectorDepth = __privateGet(this, _getVectorDepth).call(this, value);
                    let innerType = value;
                    for (let i = 0; i < vectorDepth; i++) {
                      innerType = innerType.Vector;
                    }
                    if (typeof innerType === "object" && innerType !== null && "Struct" in innerType) {
                      const structType2 = innerType.Struct;
                      const structId = `${structType2.address}::${structType2.module}::${structType2.name}`;
                      let bcsType = __privateGet(this, _object)[structId];
                      if (!bcsType) {
                        loopFlag = true;
                        return;
                      }
                      let baseType = bcsType;
                      for (let i = 0; i <= vectorDepth; i++) {
                        baseType = bcs3.vector(baseType);
                      }
                      bcsJson[objName] = baseType;
                      return;
                    }
                    if (typeof innerType === "string") {
                      let baseType;
                      switch (innerType) {
                        case "U8":
                          baseType = bcs3.u8();
                          break;
                        case "U16":
                          baseType = bcs3.u16();
                          break;
                        case "U32":
                          baseType = bcs3.u32();
                          break;
                        case "U64":
                          baseType = bcs3.u64();
                          break;
                        case "U128":
                          baseType = bcs3.u128();
                          break;
                        case "U256":
                          baseType = bcs3.u256();
                          break;
                        case "Bool":
                          baseType = bcs3.bool();
                          break;
                        case "Address":
                          baseType = bcs3.bytes(32).transform({
                            input: (val) => fromHex2(val),
                            output: (val) => toHex2(val)
                          });
                          break;
                        default:
                          return;
                      }
                      for (let i = 0; i <= vectorDepth; i++) {
                        baseType = bcs3.vector(baseType);
                      }
                      bcsJson[objName] = baseType;
                      return;
                    }
                  }
                  return;
                case "TypeParameter":
                  bcsJson[objName] = bcs3.u128();
                  return;
                default:
                  throw new Error("Unsupported type");
              }
            }
            return;
          case "string":
            switch (objType) {
              case "U8":
                bcsJson[objName] = bcs3.u8();
                return;
              case "U16":
                bcsJson[objName] = bcs3.u16();
                return;
              case "U32":
                bcsJson[objName] = bcs3.u32();
                return;
              case "U64":
                bcsJson[objName] = bcs3.u64();
                return;
              case "U128":
                bcsJson[objName] = bcs3.u128();
                return;
              case "U256":
                bcsJson[objName] = bcs3.u256();
                return;
              case "Bool":
                bcsJson[objName] = bcs3.bool();
                return;
              case "Address":
                bcsJson[objName] = bcs3.bytes(32).transform({
                  // To change the input type, you need to provide a type definition for the input
                  input: (val) => fromHex2(val),
                  output: (val) => toHex2(val)
                });
                return;
              default:
                return;
            }
          default:
            throw new Error("Unsupported type");
        }
      });
      return {
        bcs: bcs3.struct(bcsmeta.objectName, bcsJson),
        loopFlag
      };
    });
    __privateAdd(this, _bcsenum, (bcsmeta) => {
      let loopFlag = false;
      const variantJson = {};
      Object.entries(bcsmeta.objectType.variants).forEach(([name, type]) => {
        if (type.length > 0) {
          Object.entries(type).forEach(([_index, value]) => {
            const objType = value.type;
            const objName = value.name;
            switch (typeof objType) {
              case "object":
                for (const [key, value2] of Object.entries(objType)) {
                  switch (key) {
                    case "Struct":
                      const structType = value2;
                      if (structType.address === "0x1" && structType.module === "ascii" && structType.name === "String") {
                        variantJson[objName] = bcs3.string();
                        return;
                      } else if (structType.address === "0x2" && structType.module === "object" && structType.name === "UID") {
                        variantJson[objName] = bcs3.fixedArray(32, bcs3.u8()).transform({
                          input: (id) => fromHex2(id),
                          output: (id) => toHex2(Uint8Array.from(id))
                        });
                        return;
                      } else if (structType.address === "0x2" && structType.module === "object" && structType.name === "ID") {
                        variantJson[objName] = bcs3.fixedArray(32, bcs3.u8()).transform({
                          input: (id) => fromHex2(id),
                          output: (id) => toHex2(Uint8Array.from(id))
                        });
                        return;
                      } else if (structType.address === "0x2" && structType.module === "bag" && structType.name === "Bag") {
                        variantJson[objName] = bcs3.fixedArray(32, bcs3.u8()).transform({
                          input: (id) => fromHex2(id),
                          output: (id) => toHex2(Uint8Array.from(id))
                        });
                        return;
                      } else if (structType.address === "0x1" && structType.module === "option" && structType.name === "Option") {
                        switch (structType.typeArguments[0]) {
                          case "U8":
                            variantJson[objName] = bcs3.option(bcs3.u8());
                            return;
                          case "U16":
                            variantJson[objName] = bcs3.option(bcs3.u16());
                            return;
                          case "U32":
                            variantJson[objName] = bcs3.option(bcs3.u32());
                            return;
                          case "U64":
                            variantJson[objName] = bcs3.option(bcs3.u64());
                            return;
                          case "U128":
                            variantJson[objName] = bcs3.option(bcs3.u128());
                            return;
                          case "U256":
                            variantJson[objName] = bcs3.option(bcs3.u256());
                            return;
                          case "Bool":
                            variantJson[objName] = bcs3.option(bcs3.bool());
                            return;
                          case "Address":
                            variantJson[objName] = bcs3.option(
                              bcs3.bytes(32).transform({
                                // To change the input type, you need to provide a type definition for the input
                                input: (val) => fromHex2(val),
                                output: (val) => toHex2(val)
                              })
                            );
                            return;
                          default:
                        }
                      } else {
                        if (this.object[`${structType.address}::${structType.module}::${structType.name}`] === void 0) {
                          loopFlag = true;
                        } else {
                          variantJson[objName] = this.object[`${structType.address}::${structType.module}::${structType.name}`];
                          return;
                        }
                      }
                      return;
                    case "Vector":
                      if (typeof value2 === "string") {
                        switch (value2) {
                          case "U8":
                            variantJson[objName] = bcs3.vector(bcs3.u8());
                            return;
                          case "U16":
                            variantJson[objName] = bcs3.vector(bcs3.u16());
                            return;
                          case "U32":
                            variantJson[objName] = bcs3.vector(bcs3.u32());
                            return;
                          case "U64":
                            variantJson[objName] = bcs3.vector(bcs3.u64());
                            return;
                          case "U128":
                            variantJson[objName] = bcs3.vector(bcs3.u128());
                            return;
                          case "U256":
                            variantJson[objName] = bcs3.vector(bcs3.u256());
                            return;
                          case "Bool":
                            variantJson[objName] = bcs3.vector(bcs3.bool());
                            return;
                          case "Address":
                            variantJson[objName] = bcs3.vector(
                              bcs3.bytes(32).transform({
                                // To change the input type, you need to provide a type definition for the input
                                input: (val) => fromHex2(val),
                                output: (val) => toHex2(val)
                              })
                            );
                            return;
                          default:
                        }
                      }
                    case "TypeParameter":
                      variantJson[objName] = bcs3.u128();
                      return;
                    default:
                      throw new Error("Unsupported type");
                  }
                }
                return;
              case "string":
                switch (objType) {
                  case "U8":
                    variantJson[objName] = bcs3.u8();
                    return;
                  case "U16":
                    variantJson[objName] = bcs3.u16();
                    return;
                  case "U32":
                    variantJson[objName] = bcs3.u32();
                    return;
                  case "U64":
                    variantJson[objName] = bcs3.u64();
                    return;
                  case "U128":
                    variantJson[objName] = bcs3.u128();
                    return;
                  case "U256":
                    variantJson[objName] = bcs3.u256();
                    return;
                  case "Bool":
                    variantJson[objName] = bcs3.bool();
                    return;
                  case "Address":
                    variantJson[objName] = bcs3.bytes(32).transform({
                      // To change the input type, you need to provide a type definition for the input
                      input: (val) => fromHex2(val),
                      output: (val) => toHex2(val)
                    });
                    return;
                  default:
                    return;
                }
              default:
                throw new Error("Unsupported type");
            }
          });
        } else {
          variantJson[name] = null;
        }
      });
      return {
        bcs: bcs3.enum(bcsmeta.objectName, variantJson),
        loopFlag
      };
    });
    networkType = networkType ?? "mainnet";
    const defaultParams = getDefaultURL(networkType);
    this.accountManager = new SuiAccountManager({ mnemonics, secretKey });
    fullnodeUrls = fullnodeUrls || [defaultParams.fullNode];
    this.suiInteractor = new SuiInteractor(fullnodeUrls, networkType);
    this.packageId = packageId ? normalizePackageId(packageId) : void 0;
    this.channelUrl = channelUrl ?? indexerUrl;
    if (metadata !== void 0) {
      this.metadata = metadata;
      const maxLoopNum = 5;
      let loopNum = 0;
      let stillNeedFormat = true;
      while (stillNeedFormat === true && loopNum <= maxLoopNum) {
        let loopFlag = false;
        Object.values(metadata).forEach((moudlevalue) => {
          const data = moudlevalue;
          const moduleName = data.name;
          const itemModuleName = moduleName;
          if (itemModuleName.endsWith("_genesis")) {
            this.projectName = itemModuleName.replace("_genesis", "");
          }
          const objMoudleId = `${this.packageId}::${moduleName}`;
          if (data.enums) {
            Object.entries(data.enums).forEach(([enumName, enumType]) => {
              const objectId = `${objMoudleId}::${enumName}`;
              const bcsmeta = {
                objectId,
                objectName: enumName,
                objectType: enumType
              };
              let bcsObj = __privateGet(this, _bcsenum).call(this, bcsmeta);
              if (bcsObj.loopFlag === true) {
                loopFlag = bcsObj.loopFlag;
              }
              if (__privateGet(this, _object)[objectId] === void 0) {
                __privateGet(this, _object)[objectId] = bcsObj.bcs;
                __privateGet(this, _object)[`vector<${objectId}>`] = bcs3.vector(bcsObj.bcs);
                __privateGet(this, _object)[`vector<vector<${objectId}>>`] = bcs3.vector(bcs3.vector(bcsObj.bcs));
                __privateGet(this, _object)[`0x1::option::Option<${objectId}>`] = bcs3.option(bcsObj.bcs);
              }
            });
          }
          Object.entries(data.structs).forEach(([objectName, objectType]) => {
            const objectId = `${objMoudleId}::${objectName}`;
            const bcsmeta = {
              objectId,
              objectName,
              objectType
            };
            let bcsObj = __privateGet(this, _bcs).call(this, bcsmeta);
            if (bcsObj.loopFlag === true) {
              loopFlag = bcsObj.loopFlag;
            }
            __privateGet(this, _object)[objectId] = bcsObj.bcs;
            __privateGet(this, _object)[`vector<${objectId}>`] = bcs3.vector(bcsObj.bcs);
            __privateGet(this, _object)[`0x1::option::Option<${objectId}>`] = bcs3.option(bcsObj.bcs);
          });
          Object.entries(data.exposedFunctions).forEach(([funcName, funcvalue]) => {
            const meta = funcvalue;
            meta.moduleName = moduleName;
            meta.funcName = funcName;
            if (isUndefined(__privateGet(this, _query)[moduleName])) {
              __privateGet(this, _query)[moduleName] = {};
            }
            if (isUndefined(__privateGet(this, _query)[moduleName][funcName])) {
              __privateGet(this, _query)[moduleName][funcName] = createQuery(
                meta,
                (tx, p, typeArguments, isRaw) => __privateGet(this, _read).call(this, meta, tx, p, typeArguments, isRaw)
              );
            }
            if (isUndefined(__privateGet(this, _tx)[moduleName])) {
              __privateGet(this, _tx)[moduleName] = {};
            }
            if (isUndefined(__privateGet(this, _tx)[moduleName][funcName])) {
              __privateGet(this, _tx)[moduleName][funcName] = createTx(
                meta,
                (tx, p, typeArguments, isRaw, onSuccess, onError) => __privateGet(this, _exec).call(this, meta, tx, p, typeArguments, isRaw, onSuccess, onError)
              );
            }
          });
        });
        stillNeedFormat = loopFlag;
        loopNum++;
      }
    }
    this.contractFactory = new SuiContractFactory({
      packageId: this.packageId,
      metadata
    });
  }
  get query() {
    return __privateGet(this, _query);
  }
  get tx() {
    return __privateGet(this, _tx);
  }
  get object() {
    return __privateGet(this, _object);
  }
  view(dryResult) {
    let returnValues = [];
    if (dryResult.effects.status.status === "success") {
      const resultList = dryResult.results[0].returnValues;
      for (const res of resultList) {
        let baseValue = res[0];
        let baseType = res[1];
        const value = Uint8Array.from(baseValue);
        const storageValueMatch = baseType.match(/^.*::storage_value::StorageValue<(.+)>$/);
        if (storageValueMatch) {
          const innerType = storageValueMatch[1];
          if (__privateGet(this, _object)[innerType]) {
            const storageValueBcs = bcs3.struct("StorageValue", {
              contents: bcs3.vector(
                bcs3.struct("Entry", {
                  value: __privateGet(this, _object)[innerType]
                })
              )
            });
            returnValues.push(storageValueBcs.parse(value));
            continue;
          }
        }
        const storageMapMatch = baseType.match(/^.*::storage_map::StorageMap<(.+)>$/);
        if (storageMapMatch) {
          const innerType = storageMapMatch[1];
          const [keyType, valueType] = innerType.split(",").map((type) => type.trim());
          if (__privateGet(this, _object)[keyType] && __privateGet(this, _object)[valueType]) {
            const storageMapBcs = bcs3.struct("StorageMap", {
              contents: bcs3.vector(
                bcs3.struct("Entry", {
                  key: __privateGet(this, _object)[keyType],
                  value: __privateGet(this, _object)[valueType]
                })
              )
            });
            returnValues.push(storageMapBcs.parse(value));
            continue;
          }
        }
        const storageDoubleMapMatch = baseType.match(
          /^.*::storage_double_map::StorageDoubleMap<(.+)>$/
        );
        if (storageDoubleMapMatch) {
          const innerType = storageDoubleMapMatch[1];
          const [key1, key2, valueType] = innerType.split(",").map((type) => type.trim());
          if (__privateGet(this, _object)[key1] && __privateGet(this, _object)[key2] && __privateGet(this, _object)[valueType]) {
            const storageDoubleMapBcs = bcs3.struct("StorageDoubleMap", {
              contents: bcs3.vector(
                bcs3.struct("Entry", {
                  key1: __privateGet(this, _object)[key1],
                  key2: __privateGet(this, _object)[key2],
                  value: __privateGet(this, _object)[valueType]
                })
              )
            });
            returnValues.push(storageDoubleMapBcs.parse(value));
            continue;
          }
        }
        if (__privateGet(this, _object)[baseType]) {
          returnValues.push(__privateGet(this, _object)[baseType].parse(value));
          continue;
        }
        const genericMatch = baseType.match(/^([^<]+)<(.+)>$/);
        if (genericMatch) {
          const [_, genericBase, _genericParam] = genericMatch;
          const genericKey = `${genericBase}<T>`;
          if (__privateGet(this, _object)[genericKey]) {
            returnValues.push(__privateGet(this, _object)[genericKey].parse(value));
            continue;
          }
        }
        console.log("\n\x1B[41m\x1B[37m ERROR \x1B[0m \x1B[31mUnsupported Type\x1B[0m");
        console.log("\x1B[90m\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\x1B[0m");
        console.log(`\x1B[95m\u2022\x1B[0m Type: \x1B[33m"${baseType}"\x1B[0m`);
        if (genericMatch) {
          console.log(`\x1B[95m\u2022\x1B[0m Generic Base Type: \x1B[33m"${genericMatch[1]}<T>"\x1B[0m`);
        }
        console.log("\x1B[95m\n\u2728 Available Types:\x1B[0m");
        Object.keys(__privateGet(this, _object)).forEach((type) => {
          console.log(`  \x1B[36m\u25C6\x1B[0m ${type}`);
        });
        console.log("\n\x1B[34m\u{1F4A1} How to Add Custom Type:\x1B[0m");
        console.log(`  You can add custom type by extending the #object map in your code:`);
        console.log(
          `  \x1B[32mdubhe.object["${baseType}"] = bcs.struct("YourTypeName", {
    field1: bcs.string(),
    field2: bcs.u64(),
    // ... other fields
  });\x1B[0m`
        );
        console.log("\x1B[90m\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\x1B[0m\n");
        throw new Error(`Unsupported type: ${baseType}`);
      }
      return returnValues;
    } else {
      throw new ContractDataParsingError(dryResult);
    }
  }
  async state({
    tx,
    schema,
    params,
    customModuleName
  }) {
    if (!this.metadata) {
      throw new Error("Metadata is not loaded");
    }
    const moduleName = `${customModuleName ?? this.projectName}_schema`;
    const functionName = `get_${schema}`;
    let queryResponse = void 0;
    try {
      queryResponse = await this.query[moduleName][functionName]({
        tx,
        params
      });
      if (queryResponse.effects.status.status !== "success") {
        return void 0;
      }
    } catch {
      return void 0;
    }
    return this.view(queryResponse);
  }
  async parseState({
    schema,
    objectId,
    storageType,
    params,
    customModuleName
  }) {
    const tx = new Transaction2();
    const schemaObject = tx.object(objectId);
    const storageValueMatch = storageType.match(/^StorageValue<(.+)>$/);
    const storageMapMatch = storageType.match(/^StorageMap<(.+),\s*(.+)>$/);
    const storageDoubleMapMatch = storageType.match(/^StorageDoubleMap<(.+),\s*(.+),\s*(.+)>$/);
    let processedParams = [schemaObject];
    if (storageValueMatch) {
      if (params.length > 0) {
        console.warn(
          "StorageValue does not require additional parameters. Extra parameters will be ignored."
        );
      }
    } else if (storageMapMatch) {
      if (params.length !== 1) {
        throw new Error("StorageMap requires exactly one key parameter");
      }
      const keyType = storageMapMatch[1].trim();
      processedParams.push(__privateMethod(this, _processKeyParameter, processKeyParameter_fn).call(this, tx, keyType, params[0]));
    } else if (storageDoubleMapMatch) {
      if (params.length !== 2) {
        throw new Error("StorageDoubleMap requires exactly two key parameters");
      }
      const key1Type = storageDoubleMapMatch[1].trim();
      const key2Type = storageDoubleMapMatch[2].trim();
      processedParams.push(__privateMethod(this, _processKeyParameter, processKeyParameter_fn).call(this, tx, key1Type, params[0]));
      processedParams.push(__privateMethod(this, _processKeyParameter, processKeyParameter_fn).call(this, tx, key2Type, params[1]));
    } else {
      throw new Error(
        `Invalid storage type: ${storageType}. Must be StorageValue<V>, StorageMap<K,V>, or StorageDoubleMap<K1,K2,V>`
      );
    }
    return this.state({
      tx,
      schema,
      params: processedParams,
      customModuleName
    });
  }
  /**
   * else:
   * it will generate signer from the mnemonic with the given derivePathParams.
   * @param derivePathParams, such as { accountIndex: 2, isExternal: false, addressIndex: 10 }, comply with the BIP44 standard
   */
  getSigner(derivePathParams) {
    return this.accountManager.getKeyPair(derivePathParams);
  }
  /**
   * @description Switch the current account with the given derivePathParams
   * @param derivePathParams, such as { accountIndex: 2, isExternal: false, addressIndex: 10 }, comply with the BIP44 standard
   */
  switchAccount(derivePathParams) {
    this.accountManager.switchAccount(derivePathParams);
  }
  /**
   * @description Get the address of the account for the given derivePathParams
   * @param derivePathParams, such as { accountIndex: 2, isExternal: false, addressIndex: 10 }, comply with the BIP44 standard
   */
  getAddress(derivePathParams) {
    return this.accountManager.getAddress(derivePathParams);
  }
  currentAddress() {
    return this.accountManager.currentAddress;
  }
  getPackageId() {
    return this.contractFactory.packageId;
  }
  getMetadata() {
    return this.contractFactory.metadata;
  }
  getNetwork() {
    return this.suiInteractor.network;
  }
  getNetworkConfig() {
    return getDefaultURL(this.getNetwork());
  }
  getTxExplorerUrl(txHash) {
    return this.getNetworkConfig().txExplorer.replace(":txHash", txHash);
  }
  getAccountExplorerUrl(address) {
    return this.getNetworkConfig().accountExplorer.replace(":address", address);
  }
  getExplorerUrl() {
    return this.getNetworkConfig().explorer;
  }
  /**
   * Update configuration dynamically without recreating the entire instance
   * @param config - Partial configuration to update (same type as constructor)
   */
  updateConfig(config) {
    if (config.secretKey !== void 0 || config.mnemonics !== void 0) {
      this.accountManager = new SuiAccountManager({
        mnemonics: config.mnemonics,
        secretKey: config.secretKey
      });
    }
    const networkChanged = config.networkType !== void 0 && config.networkType !== this.suiInteractor.network;
    const fullnodeUrlsChanged = config.fullnodeUrls !== void 0;
    if (networkChanged || fullnodeUrlsChanged) {
      const newNetworkType = config.networkType ?? this.suiInteractor.network;
      const defaultParams = getDefaultURL(newNetworkType);
      const newFullnodeUrls = config.fullnodeUrls || [defaultParams.fullNode];
      this.suiInteractor = new SuiInteractor(newFullnodeUrls, newNetworkType);
    }
    if (config.channelUrl !== void 0 || config.indexerUrl !== void 0) {
      this.channelUrl = config.channelUrl ?? config.indexerUrl;
    }
    const packageIdChanged = config.packageId !== void 0 && config.packageId !== this.packageId;
    const metadataChanged = config.metadata !== void 0 && config.metadata !== this.metadata;
    if (packageIdChanged || metadataChanged) {
      if (config.packageId !== void 0) {
        this.packageId = normalizePackageId(config.packageId);
      }
      if (config.metadata !== void 0) {
        this.metadata = config.metadata;
        Object.keys(__privateGet(this, _query)).forEach((key) => delete __privateGet(this, _query)[key]);
        Object.keys(__privateGet(this, _tx)).forEach((key) => delete __privateGet(this, _tx)[key]);
        Object.keys(__privateGet(this, _object)).forEach((key) => delete __privateGet(this, _object)[key]);
        Object.assign(__privateGet(this, _object), BasicBcsTypes);
        const maxLoopNum = 5;
        let loopNum = 0;
        let stillNeedFormat = true;
        while (stillNeedFormat === true && loopNum <= maxLoopNum) {
          let loopFlag = false;
          Object.values(this.metadata).forEach((moudlevalue) => {
            const data = moudlevalue;
            const moduleName = data.name;
            const itemModuleName = moduleName;
            if (itemModuleName.endsWith("_genesis")) {
              this.projectName = itemModuleName.replace("_genesis", "");
            }
            const objMoudleId = `${this.packageId}::${moduleName}`;
            if (data.enums) {
              Object.entries(data.enums).forEach(([enumName, enumType]) => {
                const objectId = `${objMoudleId}::${enumName}`;
                const bcsmeta = {
                  objectId,
                  objectName: enumName,
                  objectType: enumType
                };
                let bcsObj = __privateGet(this, _bcsenum).call(this, bcsmeta);
                if (bcsObj.loopFlag === true) {
                  loopFlag = bcsObj.loopFlag;
                }
                if (__privateGet(this, _object)[objectId] === void 0) {
                  __privateGet(this, _object)[objectId] = bcsObj.bcs;
                  __privateGet(this, _object)[`vector<${objectId}>`] = bcs3.vector(bcsObj.bcs);
                  __privateGet(this, _object)[`vector<vector<${objectId}>>`] = bcs3.vector(bcs3.vector(bcsObj.bcs));
                  __privateGet(this, _object)[`0x1::option::Option<${objectId}>`] = bcs3.option(bcsObj.bcs);
                }
              });
            }
            Object.entries(data.structs).forEach(([objectName, objectType]) => {
              const objectId = `${objMoudleId}::${objectName}`;
              const bcsmeta = {
                objectId,
                objectName,
                objectType
              };
              let bcsObj = __privateGet(this, _bcs).call(this, bcsmeta);
              if (bcsObj.loopFlag === true) {
                loopFlag = bcsObj.loopFlag;
              }
              __privateGet(this, _object)[objectId] = bcsObj.bcs;
              __privateGet(this, _object)[`vector<${objectId}>`] = bcs3.vector(bcsObj.bcs);
              __privateGet(this, _object)[`0x1::option::Option<${objectId}>`] = bcs3.option(bcsObj.bcs);
            });
            Object.entries(data.exposedFunctions).forEach(([funcName, funcvalue]) => {
              const meta = funcvalue;
              meta.moduleName = moduleName;
              meta.funcName = funcName;
              if (isUndefined(__privateGet(this, _query)[moduleName])) {
                __privateGet(this, _query)[moduleName] = {};
              }
              if (isUndefined(__privateGet(this, _query)[moduleName][funcName])) {
                __privateGet(this, _query)[moduleName][funcName] = createQuery(
                  meta,
                  (tx, p, typeArguments, isRaw) => __privateGet(this, _read).call(this, meta, tx, p, typeArguments, isRaw)
                );
              }
              if (isUndefined(__privateGet(this, _tx)[moduleName])) {
                __privateGet(this, _tx)[moduleName] = {};
              }
              if (isUndefined(__privateGet(this, _tx)[moduleName][funcName])) {
                __privateGet(this, _tx)[moduleName][funcName] = createTx(
                  meta,
                  (tx, p, typeArguments, isRaw, onSuccess, onError) => __privateGet(this, _exec).call(this, meta, tx, p, typeArguments, isRaw, onSuccess, onError)
                );
              }
            });
          });
          stillNeedFormat = loopFlag;
          loopNum++;
        }
        this.contractFactory = new SuiContractFactory({
          packageId: this.packageId,
          metadata: this.metadata
        });
      }
    }
  }
  /**
   * Request some SUI from faucet
   * @Returns {Promise<boolean>}, true if the request is successful, false otherwise.
   */
  async requestFaucet(address, network, derivePathParams) {
    if (address === void 0) {
      address = this.accountManager.getAddress(derivePathParams);
    }
    if (network === void 0) {
      network = this.getNetwork();
    }
    return this.suiInteractor.requestFaucet(address, network);
  }
  async getBalance(coinType, derivePathParams) {
    const owner = this.accountManager.getAddress(derivePathParams);
    return this.suiInteractor.currentClient.getBalance({ owner, coinType });
  }
  async balanceOf(accountAddress, coinType, derivePathParams) {
    if (accountAddress === void 0) {
      accountAddress = this.accountManager.getAddress(derivePathParams);
    }
    const owner = accountAddress;
    return this.suiInteractor.currentClient.getBalance({ owner, coinType });
  }
  client() {
    return this.suiInteractor.currentClient;
  }
  async getObject(objectId) {
    return this.suiInteractor.getObject(objectId);
  }
  async getObjects(objectIds) {
    return this.suiInteractor.getObjects(objectIds);
  }
  async signTxn(tx, derivePathParams) {
    if (tx instanceof SuiTx || tx instanceof Transaction2) {
      tx.setSender(this.getAddress(derivePathParams));
    }
    const txBlock = tx instanceof SuiTx ? tx.tx : tx;
    const txBytes = txBlock instanceof Transaction2 ? await txBlock.build({ client: this.client() }) : txBlock;
    const keyPair = this.getSigner(derivePathParams);
    return await keyPair.signTransaction(txBytes);
  }
  async signAndSendTxn({
    tx,
    derivePathParams,
    onSuccess,
    onError
  }) {
    try {
      const { bytes, signature } = await this.signTxn(tx, derivePathParams);
      const result = await this.sendTx(bytes, signature);
      if (result.effects?.status.status === "success") {
        if (onSuccess) {
          await onSuccess(result);
        }
      } else {
        if (onError) {
          await onError(new Error(`Transaction failed: ${result.effects?.status.error}`));
        }
      }
      return result;
    } catch (error) {
      if (onError) {
        await onError(error);
      }
      throw error;
    }
  }
  async sendTx(transaction, signature) {
    return this.suiInteractor.sendTx(transaction, signature);
  }
  async waitForTransaction(digest) {
    return this.suiInteractor.waitForTransaction({ digest });
  }
  async waitForIndexerTransaction(digest) {
    return this.waitForTransaction(digest);
  }
  setChannelUrl(channelUrl) {
    this.channelUrl = channelUrl.replace(/\/$/, "");
  }
  getChannelUrl() {
    if (!this.channelUrl) {
      throw new Error("channelUrl is not configured");
    }
    return this.channelUrl.replace(/\/$/, "");
  }
  async latestNonce(sender) {
    const result = await __privateMethod(this, _channelPost, channelPost_fn).call(this, "/v2/nonce", {
      sender: sender ?? this.getAddress()
    });
    return Number(result.nonce ?? 0);
  }
  async queryChannelTable({
    dappKey,
    account,
    table,
    key
  }) {
    const tableKey = __privateMethod(this, _buildChannelTableKey, buildChannelTableKey_fn).call(this, { dappKey, account, table, key });
    const result = await __privateMethod(this, _channelPost, channelPost_fn).call(this, "/v2/query", {
      query: {
        entity: "table",
        key: JSON.stringify(tableKey),
        scope: {}
      }
    });
    return {
      message: Boolean(result.found ?? result.message ?? false),
      data: Array.isArray(result.data) ? result.data : result.data?.value ?? []
    };
  }
  async subscribeChannelTable({
    dappKey,
    account,
    table,
    key
  }, handlers = {}) {
    const filters = {};
    if (dappKey)
      filters.dapp_key = dappKey;
    if (account)
      filters.account = account.replace(/^0x/, "");
    if (table)
      filters.table = table;
    if (key)
      filters.key = JSON.stringify(key);
    return __privateMethod(this, _channelSubscribe, channelSubscribe_fn).call(this, {
      topics: ["table"],
      filters,
      semantics: "AtLeastOnce"
    }, {
      onOpen: handlers.onOpen,
      onError: handlers.onError,
      onClose: handlers.onClose,
      onMessage: (payload) => {
        const tablePayload = payload?.payload ?? payload;
        const dataKey = tablePayload?.data_key ?? tablePayload?.dataKey;
        if (dataKey && tablePayload?.value) {
          handlers.onMessage?.({
            dapp_key: dataKey.dapp_key,
            account: dataKey.account,
            table: dataKey.table,
            key: dataKey.key,
            value: tablePayload.value
          });
        }
      }
    });
  }
  async subscribeChannel(spec, handlers = {}) {
    return __privateMethod(this, _channelSubscribe, channelSubscribe_fn).call(this, spec, handlers);
  }
  async publishChannelEvent({
    id,
    topic,
    partitionKey,
    kind,
    tsMs,
    payload,
    metadata
  }) {
    return __privateMethod(this, _channelPost, channelPost_fn).call(this, "/v2/publish", {
      event: {
        id: id ?? "",
        topic,
        partition_key: partitionKey,
        kind,
        ts_ms: tsMs ?? 0,
        payload: payload ?? null,
        metadata: {
          ...this.packageId ? { dapp_key: __privateMethod(this, _defaultDappKey, defaultDappKey_fn).call(this) } : {},
          ...metadata ?? {}
        }
      }
    });
  }
  async submitToChannel({
    tx,
    nonce,
    sender
  }) {
    const channelSender = sender ?? this.getAddress();
    const resolvedNonce = nonce ?? await this.latestNonce(channelSender);
    const payload = __privateMethod(this, _buildChannelSubmitPayload, buildChannelSubmitPayload_fn).call(this, {
      tx,
      sender: channelSender,
      nonce: resolvedNonce
    });
    return __privateMethod(this, _channelPost, channelPost_fn).call(this, "/v2/submit", payload);
  }
  async submitBatchToChannel({
    txs,
    sender,
    startNonce
  }) {
    if (txs.length === 0) {
      throw new Error("submitBatchToChannel requires at least one transaction");
    }
    const channelSender = sender ?? this.getAddress();
    const resolvedStartNonce = startNonce ?? await this.latestNonce(channelSender);
    const requests = txs.map(
      (tx, index) => __privateMethod(this, _buildChannelSubmitPayload, buildChannelSubmitPayload_fn).call(this, {
        tx,
        sender: channelSender,
        nonce: resolvedStartNonce + index
      })
    );
    return __privateMethod(this, _channelPost, channelPost_fn).call(this, "/v2/submit_batch", {
      requests
    });
  }
  /**
   * Transfer the given amount of SUI to the recipient
   * @param recipient
   * @param amount
   * @param derivePathParams
   */
  async transferSui(recipient, amount, derivePathParams) {
    const tx = new SuiTx();
    tx.transferSui(recipient, amount);
    return this.signAndSendTxn({ tx, derivePathParams });
  }
  /**
   * Transfer to mutliple recipients
   * @param recipients the recipients addresses
   * @param amounts the amounts of SUI to transfer to each recipient, the length of amounts should be the same as the length of recipients
   * @param derivePathParams
   */
  async transferSuiToMany(recipients, amounts, derivePathParams) {
    const tx = new SuiTx();
    tx.transferSuiToMany(recipients, amounts);
    return this.signAndSendTxn({ tx, derivePathParams });
  }
  /**
   * Transfer the given amounts of coin to multiple recipients
   * @param recipients the list of recipient address
   * @param amounts the amounts to transfer for each recipient
   * @param coinType any custom coin type but not SUI
   * @param derivePathParams the derive path params for the current signer
   */
  async transferCoinToMany(recipients, amounts, coinType, derivePathParams) {
    const tx = new SuiTx();
    const owner = this.accountManager.getAddress(derivePathParams);
    const totalAmount = amounts.reduce((a, b) => a + b, 0);
    const coins = await this.suiInteractor.selectCoins(owner, totalAmount, coinType);
    tx.transferCoinToMany(
      coins.map((c) => c.objectId),
      owner,
      recipients,
      amounts
    );
    return this.signAndSendTxn({ tx, derivePathParams });
  }
  async transferCoin(recipient, amount, coinType, derivePathParams) {
    return this.transferCoinToMany([recipient], [amount], coinType, derivePathParams);
  }
  async transferObjects(objects, recipient, derivePathParams) {
    const tx = new SuiTx();
    tx.transferObjects(objects, recipient);
    return this.signAndSendTxn({ tx, derivePathParams });
  }
  async moveCall(callParams) {
    const { target, arguments: args = [], typeArguments = [], derivePathParams } = callParams;
    const tx = new SuiTx();
    tx.moveCall(target, args, typeArguments);
    return this.signAndSendTxn({ tx, derivePathParams });
  }
  /**
   * Select coins with the given amount and coin type, the total amount is greater than or equal to the given amount
   * @param amount
   * @param coinType
   * @param owner
   */
  async selectCoinsWithAmount(amount, coinType, owner) {
    owner = owner || this.accountManager.currentAddress;
    const coins = await this.suiInteractor.selectCoins(owner, amount, coinType);
    return coins.map((c) => c.objectId);
  }
  async selectObjectsWithType(objectType, owner) {
    owner = owner || this.accountManager.currentAddress;
    const objects = await this.suiInteractor.selectObjects(owner, objectType);
    return objects.map((c) => c.objectId);
  }
  /**
   * stake the given amount of SUI to the validator
   * @param amount the amount of SUI to stake
   * @param validatorAddr the validator address
   * @param derivePathParams the derive path params for the current signer
   */
  async stakeSui(amount, validatorAddr, derivePathParams) {
    const tx = new SuiTx();
    tx.stakeSui(amount, validatorAddr);
    return this.signAndSendTxn({ tx, derivePathParams });
  }
  /**
   * Execute the transaction with on-chain data but without really submitting. Useful for querying the effects of a transaction.
   * Since the transaction is not submitted, its gas cost is not charged.
   * @param tx the transaction to execute
   * @param derivePathParams the derive path params
   * @returns the effects and events of the transaction, such as object changes, gas cost, event emitted.
   */
  async inspectTxn(tx, derivePathParams) {
    const txBlock = tx instanceof SuiTx ? tx.tx : tx;
    return this.suiInteractor.currentClient.devInspectTransactionBlock({
      transactionBlock: txBlock,
      sender: this.getAddress(derivePathParams)
    });
  }
  async getOwnedObjects(owner, cursor, limit) {
    const ownedObjects = await this.suiInteractor.getOwnedObjects(owner, cursor, limit);
    const ownedObjectsRes = [];
    for (const object of ownedObjects.data) {
      const objectDetail = await this.getObject(object.data.objectId);
      if (objectDetail.type.split("::")[0] === this.contractFactory.packageId) {
        ownedObjectsRes.push(objectDetail);
      }
    }
    return ownedObjectsRes;
  }
  async entity_key_from_object(objectId) {
    const checkObjectId = normalizeHexAddress(objectId);
    if (checkObjectId !== null) {
      objectId = checkObjectId;
      return objectId;
    } else {
      return void 0;
    }
  }
  async entity_key_from_bytes(bytes) {
    const hashBytes = keccak256(bytes);
    const hashU8Array = Array.from(hashBytes);
    const value = Uint8Array.from(hashU8Array);
    const Address = bcs3.bytes(32).transform({
      // To change the input type, you need to provide a type definition for the input
      input: (val) => fromHex2(val),
      output: (val) => toHex2(val)
    });
    const data = Address.parse(value);
    return "0x" + data;
  }
  async entity_key_from_address_with_seed(objectId, seed) {
    const checkObjectId = normalizeHexAddress(objectId);
    if (checkObjectId !== null) {
      objectId = checkObjectId;
      const bytes = Buffer.from(objectId.slice(2), "hex");
      const newBuffer = Buffer.concat([bytes, Buffer.from(seed, "utf-8")]);
      return this.entity_key_from_bytes(newBuffer);
    } else {
      return void 0;
    }
  }
  async entity_key_from_address_with_u256(objectId, x) {
    const checkObjectId = normalizeHexAddress(objectId);
    if (checkObjectId !== null) {
      objectId = checkObjectId;
      const bytes = Buffer.from(objectId.slice(2), "hex");
      const numberBytes = bcs3.u256().serialize(x).toBytes();
      return this.entity_key_from_bytes(Buffer.concat([bytes, numberBytes]));
    } else {
      return void 0;
    }
  }
  async entity_key_from_u256(x) {
    return numberToAddressHex(x);
  }
  // async formatData(type: string, value: Buffer | number[] | Uint8Array) {
  //   const u8Value = Uint8Array.from(value);
  //   return bcs.de(type, u8Value);
  // }
};
_query = new WeakMap();
_tx = new WeakMap();
_object = new WeakMap();
_exec = new WeakMap();
_read = new WeakMap();
_getVectorDepth = new WeakMap();
_bcs = new WeakMap();
_bcsenum = new WeakMap();
_processKeyParameter = new WeakSet();
processKeyParameter_fn = function(tx, keyType, value) {
  switch (keyType.toLowerCase()) {
    case "u8":
      return tx.pure.u8(value);
    case "u16":
      return tx.pure.u16(value);
    case "u32":
      return tx.pure.u32(value);
    case "u64":
      return tx.pure.u64(value);
    case "u128":
      return tx.pure.u128(value);
    case "u256":
      return tx.pure.u256(value);
    case "bool":
      return tx.pure.bool(value);
    case "address":
      return tx.pure.address(value);
    default:
      if (keyType.includes("::")) {
        return tx.object(value);
      }
      console.log("\n\x1B[41m\x1B[37m ERROR \x1B[0m \x1B[31mUnsupported Key Type\x1B[0m");
      console.log("\x1B[90m\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\x1B[0m");
      console.log(`\x1B[95m\u2022\x1B[0m Type: \x1B[33m"${keyType}"\x1B[0m`);
      console.log("\x1B[95m\u2022\x1B[0m Supported Types:\x1B[0m");
      console.log("  \x1B[36m\u25C6\x1B[0m u8, u16, u32, u64, u128, u256");
      console.log("  \x1B[36m\u25C6\x1B[0m bool");
      console.log("  \x1B[36m\u25C6\x1B[0m address");
      console.log("  \x1B[36m\u25C6\x1B[0m object (format: package::module::type)");
      console.log("\x1B[90m\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\x1B[0m\n");
      throw new Error(`Unsupported key type: ${keyType}`);
  }
};
_defaultDappKey = new WeakSet();
defaultDappKey_fn = function() {
  if (!this.packageId) {
    throw new Error("packageId is not configured");
  }
  return `${this.packageId.replace(/^0x/, "")}::dapp_key::DappKey`;
};
_buildChannelTableKey = new WeakSet();
buildChannelTableKey_fn = function({
  dappKey,
  account,
  table,
  key
}) {
  return {
    dapp_key: dappKey ?? __privateMethod(this, _defaultDappKey, defaultDappKey_fn).call(this),
    account: (account ?? this.getAddress()).replace(/^0x/, ""),
    table,
    key
  };
};
_detectChannelChain = new WeakSet();
detectChannelChain_fn = function(address) {
  const cleanAddress = address.startsWith("0x") ? address.slice(2) : address;
  if (address.startsWith("0x") && cleanAddress.length === 64 && /^[0-9a-fA-F]+$/.test(cleanAddress)) {
    return "sui";
  }
  if (address.startsWith("0x") && cleanAddress.length === 40 && /^[0-9a-fA-F]+$/.test(cleanAddress)) {
    return "evm";
  }
  if (!address.startsWith("0x") && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return "solana";
  }
  return "sui";
};
_buildChannelSubmitPayload = new WeakSet();
buildChannelSubmitPayload_fn = function({
  tx,
  sender,
  nonce
}) {
  const txBlock = tx instanceof SuiTx ? tx.tx : tx;
  return {
    chain: __privateMethod(this, _detectChannelChain, detectChannelChain_fn).call(this, sender),
    sender,
    nonce,
    ptb: txBlock.getData(),
    signature: "base64_encoded_signature_placeholder"
  };
};
_channelPost = new WeakSet();
channelPost_fn = async function(path, body) {
  const response = await fetch(`${this.getChannelUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Channel request failed: ${response.status} ${await response.text()}`);
  }
  return await response.json();
};
_channelSubscribe = new WeakSet();
channelSubscribe_fn = async function(spec, handlers = {}) {
  const controller = new AbortController();
  let isClosed = false;
  const closeOnce = () => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    handlers.onClose?.();
  };
  const response = await fetch(`${this.getChannelUrl()}/v2/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ spec }),
    signal: controller.signal
  });
  if (!response.ok || !response.body) {
    throw new Error(`Channel subscribe failed: ${response.status}`);
  }
  handlers.onOpen?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          separatorIndex = buffer.indexOf("\n\n");
          const dataLines = rawEvent.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
          if (dataLines.length === 0) {
            continue;
          }
          handlers.onMessage?.(JSON.parse(dataLines.join("\n")));
        }
      }
      closeOnce();
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError?.(error);
      }
      closeOnce();
    }
  })();
  return () => {
    controller.abort();
    closeOnce();
  };
};

// src/libs/multiSig/client.ts
import { MultiSigPublicKey } from "@mysten/sui/multisig";

// src/libs/multiSig/publickey.ts
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { fromB64 as fromB642 } from "@mysten/sui/utils";
function ed25519PublicKeyFromBase64(rawPubkey) {
  let bytes = fromB642(rawPubkey);
  if (bytes.length !== 32 && bytes.length !== 33)
    throw "invalid pubkey length";
  bytes = bytes.length === 33 ? bytes.slice(1) : bytes;
  return new Ed25519PublicKey(bytes);
}

// src/libs/multiSig/client.ts
var MultiSigClient = class _MultiSigClient {
  constructor(pks, threshold) {
    this.pksWeightPairs = pks;
    this.threshold = threshold;
    this.multiSigPublicKey = MultiSigPublicKey.fromPublicKeys({
      threshold: this.threshold,
      publicKeys: this.pksWeightPairs
    });
  }
  static fromRawEd25519PublicKeys(rawPublicKeys, weights, threshold) {
    const pks = rawPublicKeys.map((rawPublicKey, i) => {
      return {
        publicKey: ed25519PublicKeyFromBase64(rawPublicKey),
        weight: weights[i]
      };
    });
    return new _MultiSigClient(pks, threshold);
  }
  multiSigAddress() {
    return this.multiSigPublicKey.toSuiAddress();
  }
  combinePartialSigs(sigs) {
    return this.multiSigPublicKey.combinePartialSignatures(sigs);
  }
};

// src/metadata/index.ts
import { getFullnodeUrl } from "@mysten/sui/client";
async function loadMetadata(networkType, packageId, fullnodeUrls) {
  fullnodeUrls = fullnodeUrls || [getFullnodeUrl(networkType)];
  const suiInteractor = new SuiInteractor(fullnodeUrls);
  if (packageId !== void 0) {
    const jsonData = await suiInteractor.getNormalizedMoveModulesByPackage(packageId);
    return jsonData;
  } else {
    console.error("please set your package id.");
  }
}
export {
  BcsType2 as BcsType,
  Dubhe,
  MultiSigClient,
  SuiAccountManager,
  SuiContractFactory,
  SuiTx,
  bcs4 as bcs,
  loadMetadata
};
//# sourceMappingURL=index.mjs.map