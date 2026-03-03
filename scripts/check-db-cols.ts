import "dotenv/config";
import { prisma } from "../src/lib/prisma";
async function main() {
  const result = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' ORDER BY ordinal_position`
  );
  console.log(JSON.stringify(result, null, 2));
}
main().finally(() => prisma.$disconnect());
