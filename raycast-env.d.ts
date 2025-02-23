/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API ID - Your Telegram API ID from https://my.telegram.org/apps */
  "apiId": string,
  /** API Hash - Your Telegram API Hash from https://my.telegram.org/apps */
  "apiHash": string,
  /** 2FA Password - Your Telegram 2FA password (if enabled) */
  "password2FA"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `index` command */
  export type Index = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `index` command */
  export type Index = {}
}

