import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const s = await prisma.site_settings.findUnique({ where: { id: "main" }, select: { hero_image_url: true } });
  const i = await prisma.items.findFirst({ select: { image_url: true, image_urls: true, title: true } });
  console.log("hero_image_url:", JSON.stringify(s?.hero_image_url));
  console.log("first item image_urls[0]:", JSON.stringify(i?.image_urls?.[0]));
}

main()
  .finally(() => prisma.$disconnect());
