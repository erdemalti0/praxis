/**
 * Patches the Electron binary's Info.plist on macOS so the menu bar
 * and dock show "Praxis" instead of "Electron" during development.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const appPath = path.join(
  __dirname,
  "../node_modules/electron/dist/Electron.app"
);
const plistPath = path.join(appPath, "Contents/Info.plist");

if (process.platform === "darwin" && fs.existsSync(plistPath)) {
  try {
    execSync(`defaults write "${plistPath}" CFBundleName "Praxis"`);
    execSync(`defaults write "${plistPath}" CFBundleDisplayName "Praxis"`);
    execSync(`defaults write "${plistPath}" CFBundleIdentifier "com.praxis.app"`);
    // Touch app bundle to invalidate macOS cache
    execSync(`touch "${appPath}"`);
    console.log("Patched Electron Info.plist → Praxis");
  } catch (err) {
    console.warn("Failed to patch Electron Info.plist:", err.message);
  }
} else {
  console.log("Skipping plist patch (not macOS or plist not found)");
}
