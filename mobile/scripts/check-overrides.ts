import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

interface OverrideCheck {
  name: string;
  originalPath: string;
  overridePath: string;
  requiredExports: string[];
}

const checks: OverrideCheck[] = [
  {
    name: "AnalyticsDashboard",
    originalPath: path.resolve(rootDir, "src/components/admin/AnalyticsDashboard.tsx"),
    overridePath: path.resolve(rootDir, "mobile/src/overrides/AnalyticsDashboard.tsx"),
    requiredExports: ["AnalyticsDashboard", "default"],
  },
  {
    name: "DatabaseDashboard",
    originalPath: path.resolve(rootDir, "src/components/admin/DatabaseDashboard.tsx"),
    overridePath: path.resolve(rootDir, "mobile/src/overrides/DatabaseDashboard.tsx"),
    requiredExports: ["DatabaseDashboard", "default"],
  },
  {
    name: "TestTimer",
    originalPath: path.resolve(rootDir, "src/components/TestTimer.tsx"),
    overridePath: path.resolve(rootDir, "mobile/src/overrides/TestTimer.tsx"),
    requiredExports: ["TestTimer"],
  },
  {
    name: "SupabaseClient",
    originalPath: path.resolve(rootDir, "src/integrations/supabase/client.ts"),
    overridePath: path.resolve(rootDir, "mobile/src/overrides/supabaseClient.ts"),
    requiredExports: ["supabase"],
  },
  {
    name: "pdfGenerator",
    originalPath: path.resolve(rootDir, "src/lib/pdfGenerator.ts"),
    overridePath: path.resolve(rootDir, "mobile/src/overrides/pdfGenerator.ts"),
    requiredExports: [
      "generateTestResultPDF",
      "downloadTestResultPDF",
      "getPDFBlob",
      "generateBulkTestResultsPDF",
      "downloadBulkTestResultsPDF",
    ],
  },
];

console.log("🔍 Checking mobile override export parity with original web modules...");

let hasErrors = false;

for (const check of checks) {
  if (!fs.existsSync(check.originalPath)) {
    console.error(`❌ Original file not found: ${check.originalPath}`);
    hasErrors = true;
    continue;
  }

  if (!fs.existsSync(check.overridePath)) {
    console.error(`❌ Override file not found: ${check.overridePath}`);
    hasErrors = true;
    continue;
  }

  const overrideContent = fs.readFileSync(check.overridePath, "utf-8");

  for (const exp of check.requiredExports) {
    const isNamed = new RegExp(`export\\s+(const|function|class|let)\\s+${exp}\\b|export\\s*\\{[^}]*\\b${exp}\\b[^}]*\\}`).test(overrideContent);
    const isDefault = exp === "default" && (/export\s+default\b/.test(overrideContent) || /export\s*\{[^}]*\bdefault\b[^}]*\}/.test(overrideContent));

    if (!isNamed && !isDefault) {
      console.error(`❌ Override ${check.name} missing required export: ${exp}`);
      hasErrors = true;
    }
  }

  console.log(`✅ ${check.name} override exports validated successfully.`);
}

if (hasErrors) {
  console.error("\n💥 Override check failed! Overrides have drifted from original web exports.");
  process.exit(1);
} else {
  console.log("\n🎉 All mobile overrides match web exports!");
  process.exit(0);
}
