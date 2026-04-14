import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'pedroforoni@gmail.com';
  console.log(`Promovendo ${email} para ADMIN e ativando conta...`);

  const user = await prisma.appUser.update({
    where: { email },
    data: {
      role: 'ADMIN',
      active: true,
    },
  });

  console.log('Sucesso!', user);
}

main()
  .catch((e) => {
    console.error('Erro ao promover usuario:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
