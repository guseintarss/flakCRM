import type { Db } from '../db';
import type { Vertical } from '../../shared/site';
import { addDays, todayInTimeZone } from '../lib/dates';
import { config } from '../config';
import { hashPassword } from './auth';
import { addMembership, createAccount, findAccountByEmail, getTenantBySlug } from './registry';
import type { TenantStore } from './tenant';
import { provisionTenant } from './provision';
import {
  createSiteItem,
  createSiteRequest,
  ensureSiteConfig,
  listSiteItems,
  listSiteRequests,
  setSitePublished,
  updateSiteConfig,
  updateSiteRequestStatus,
} from './site';

export const DEMO_EMAIL = 'owner@flakcrm.ru';
export const DEMO_PASSWORD = 'demo12345';

interface DemoItem {
  name: string;
  description: string;
  priceMinor: number;
  durationMin?: number;
  capacity?: number;
}

interface DemoRequest {
  guestName: string;
  phone: string;
  email?: string | null;
  /** Смещение от сегодняшней даты в днях. */
  daysAhead?: number;
  requestedTime?: string | null;
  /** Количество ночей для туризма. */
  nights?: number;
  guests?: number | null;
  /** Индекс позиции в каталоге сайта. */
  itemIndex?: number | null;
  comment?: string | null;
  status?: 'new' | 'contacted' | 'qualified' | 'disqualified';
}

interface DemoSite {
  slug: string;
  name: string;
  vertical: Vertical;
  tagline: string;
  description: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  workingHours: string;
  brandColor: string;
  coverUrl: string;
  items: DemoItem[];
  requests: DemoRequest[];
}

const SITES: DemoSite[] = [
  {
    slug: 'tihiy-dvorik',
    name: 'Тихий дворик',
    vertical: 'restaurant',
    tagline: 'Домашняя кухня на дровах',
    description:
      'Небольшой ресторан в центре Нальчика. Готовим на открытом огне, печём хычины по семейному рецепту и наливаем чай из горных трав.',
    city: 'Нальчик',
    address: 'ул. Ленина, 24',
    phone: '+7 (8662) 44-18-90',
    email: 'hello@tihiy-dvorik.ru',
    workingHours: 'Ежедневно 12:00–23:00',
    brandColor: '#b3541e',
    coverUrl: '/demo/restaurant-cover.svg',
    items: [
      {
        name: 'Хычины с сыром и зеленью',
        description: 'Тонкие лепёшки с начинкой из свежего сыра, подаём со сметаной.',
        priceMinor: 24_000,
      },
      {
        name: 'Шашлык из баранины',
        description: 'Мясо на углях, печёный лук и соус наршараб.',
        priceMinor: 59_000,
      },
      {
        name: 'Домашний хачапури',
        description: 'Слоёное тесто, сыр сулугуни и яйцо. Готовим 20 минут.',
        priceMinor: 42_000,
      },
      {
        name: 'Салат с грецким орехом',
        description: 'Томаты, огурцы, кинза и домашняя заправка из орехов.',
        priceMinor: 32_000,
      },
      {
        name: 'Чай из горных трав',
        description: 'Чабрец, мята и шиповник. Завариваем в чайнике на две чашки.',
        priceMinor: 18_000,
      },
    ],
    requests: [
      {
        guestName: 'Амина К.',
        phone: '+7 928 000-11-22',
        daysAhead: 1,
        requestedTime: '19:30',
        guests: 4,
        itemIndex: 0,
        comment: 'Столик у окна, если можно.',
        status: 'new',
      },
      {
        guestName: 'Дамир Т.',
        phone: '+7 928 111-22-33',
        daysAhead: 2,
        requestedTime: '20:00',
        guests: 2,
        itemIndex: 1,
        comment: 'Один из гостей не ест острое.',
        status: 'contacted',
      },
      {
        guestName: 'Ольга С.',
        phone: '+7 903 222-33-44',
        daysAhead: 3,
        requestedTime: '18:30',
        guests: 6,
        itemIndex: 2,
        comment: 'День рождения, нужен торт со свечами.',
        status: 'qualified',
      },
    ],
  },
  {
    slug: 'chayhana-nal',
    name: 'Чайхана «Наль»',
    vertical: 'restaurant',
    tagline: 'Кавказская кухня и чай на травах',
    description:
      'Семейная чайхана на набережной. Готовим плов и лагман в казане, печём самсу и завариваем чай с горными травами. Большой зал для семейных встреч.',
    city: 'Нальчик',
    address: 'пр. Шогенцукова, 7',
    phone: '+7 (8662) 77-30-10',
    email: 'hello@chayhana-nal.ru',
    workingHours: 'Ежедневно 11:00–22:00',
    brandColor: '#7a4b2a',
    coverUrl: '/demo/teahouse-cover.svg',
    items: [
      {
        name: 'Плов по-домашнему',
        description: 'Рис, баранина, морковь и зира. Подаём с салатом из помидоров.',
        priceMinor: 42_000,
      },
      {
        name: 'Лагман с бараниной',
        description: 'Домашняя лапша, мясо и овощи в насыщенном бульоне.',
        priceMinor: 39_000,
      },
      {
        name: 'Хычины с картофелем и сыром',
        description: 'Тонкие лепёшки с картофельно-сырной начинкой и зеленью.',
        priceMinor: 22_000,
      },
      {
        name: 'Самса с говядиной',
        description: 'Слоёное тесто и сочная начинка из говядины с луком.',
        priceMinor: 16_000,
      },
      {
        name: 'Чай с чабрецом и мёдом',
        description: 'Большой чайник, горный чабрец и местный мёд.',
        priceMinor: 14_000,
      },
    ],
    requests: [
      {
        guestName: 'Мурат Б.',
        phone: '+7 928 333-44-55',
        daysAhead: 1,
        requestedTime: '13:00',
        guests: 3,
        itemIndex: 0,
        comment: 'Нужен детский стул.',
        status: 'new',
      },
      {
        guestName: 'Елена В.',
        phone: '+7 918 444-55-66',
        daysAhead: 2,
        requestedTime: '19:00',
        guests: 5,
        itemIndex: 1,
        comment: 'Посадите в тихом зале.',
        status: 'contacted',
      },
    ],
  },
  {
    slug: 'gorservice',
    name: 'ГорСервис',
    vertical: 'service',
    tagline: 'Ремонт бытовой техники на выезде',
    description:
      'Приедем в удобное время, проведём диагностику и починим технику на месте. Работаем по Нальчику и пригороду, даём гарантию на работы.',
    city: 'Нальчик',
    address: 'ул. Кирова, 18',
    phone: '+7 (928) 715-40-20',
    email: 'master@gorservice.ru',
    workingHours: 'Пн–Сб 09:00–20:00',
    brandColor: '#245c73',
    coverUrl: '/demo/service-cover.svg',
    items: [
      {
        name: 'Диагностика на выезде',
        description: 'Найдём причину поломки и назовём точную стоимость ремонта.',
        priceMinor: 0,
        durationMin: 30,
      },
      {
        name: 'Ремонт стиральной машины',
        description: 'Замена насоса, подшипников, датчиков и уплотнителей.',
        priceMinor: 250_000,
        durationMin: 90,
      },
      {
        name: 'Ремонт холодильника',
        description: 'Заправка фреоном, замена компрессора и термостата.',
        priceMinor: 320_000,
        durationMin: 120,
      },
      {
        name: 'Установка посудомоечной машины',
        description: 'Подключение к воде и канализации, проверка всех режимов.',
        priceMinor: 190_000,
        durationMin: 120,
      },
      {
        name: 'Обслуживание кондиционера',
        description: 'Чистка фильтров, проверка давления и дозаправка.',
        priceMinor: 280_000,
        durationMin: 90,
      },
    ],
    requests: [
      {
        guestName: 'Ирина П.',
        phone: '+7 928 555-66-77',
        daysAhead: 1,
        itemIndex: 4,
        comment: 'Кондиционер не охлаждает, квартира на пятом этаже.',
        status: 'new',
      },
      {
        guestName: 'Сергей Л.',
        phone: '+7 903 666-77-88',
        email: 'sergey.l@example.ru',
        daysAhead: 2,
        itemIndex: 1,
        comment: 'Стиральная машина показывает ошибку E20, вода не сливается.',
        status: 'contacted',
      },
    ],
  },
  {
    slug: 'gostevoy-dom-elbrus',
    name: 'Гостевой дом «Эльбрус»',
    vertical: 'tourism',
    tagline: 'Горы, тишина и завтрак из местных продуктов',
    description:
      'Гостевой дом в Архызе в пяти минутах от канатной дороги. Из окон открывается вид на горы, во дворе — мангальная зона и парковка. Завтрак включён.',
    city: 'Архыз',
    address: 'ул. Горная, 12',
    phone: '+7 (928) 123-45-67',
    email: 'stay@elbrus-guest.ru',
    workingHours: 'Заезд с 14:00, выезд до 12:00',
    brandColor: '#2f6f4e',
    coverUrl: '/demo/tourism-cover.svg',
    items: [
      {
        name: 'Стандарт с видом на горы',
        description: 'Двуспальная кровать, санузел, балкон с видом на хребет.',
        priceMinor: 320_000,
        capacity: 2,
      },
      {
        name: 'Семейный номер',
        description: 'Две комнаты, большая кровать и диван для двоих детей.',
        priceMinor: 480_000,
        capacity: 4,
      },
      {
        name: 'Мансарда с балконом',
        description: 'Тихий номер под крышей, письменный стол и панорамное окно.',
        priceMinor: 390_000,
        capacity: 3,
      },
      {
        name: 'Домик у реки',
        description: 'Отдельный домик с террасой, кухней и мангалом.',
        priceMinor: 620_000,
        capacity: 4,
      },
    ],
    requests: [
      {
        guestName: 'Анна и Павел',
        phone: '+7 916 777-88-99',
        email: 'anna.p@example.ru',
        daysAhead: 7,
        nights: 3,
        guests: 2,
        itemIndex: 0,
        comment: 'Нужен ранний заезд: поезд приходит в 10 утра.',
        status: 'new',
      },
      {
        guestName: 'Тимур Х.',
        phone: '+7 928 888-99-00',
        daysAhead: 14,
        nights: 2,
        guests: 4,
        itemIndex: 1,
        comment: 'Приедем с двумя детьми, нужна парковка.',
        status: 'contacted',
      },
    ],
  },
];

export async function seedNetworkDemo(
  registry: Db,
  store: TenantStore,
  tenantsDir: string,
): Promise<void> {
  let account = findAccountByEmail(registry, DEMO_EMAIL);
  if (!account) {
    const created = createAccount(registry, {
      email: DEMO_EMAIL,
      name: 'Владелец сети',
      passwordHash: await hashPassword(DEMO_PASSWORD),
    });
    account = { ...created, passwordHash: '' };
  }

  for (const site of SITES) {
    const existing = getTenantBySlug(registry, site.slug);
    if (existing) {
      addMembership(registry, existing.id, account.id);
      continue;
    }

    const tenant = provisionTenant(registry, store, tenantsDir, account, {
      name: site.name,
      vertical: site.vertical,
      slug: site.slug,
    });
    const db = store.open(tenant);
    ensureSiteConfig(db, tenant);
    updateSiteConfig(db, tenant, {
      name: site.name,
      tagline: site.tagline,
      description: site.description,
      city: site.city,
      address: site.address,
      phone: site.phone,
      email: site.email,
      workingHours: site.workingHours,
      brandColor: site.brandColor,
      coverUrl: site.coverUrl,
    });

    if (listSiteItems(db).length === 0) {
      site.items.forEach((item, index) => {
        createSiteItem(db, tenant, {
          name: item.name,
          description: item.description,
          priceMinor: item.priceMinor,
          durationMin: item.durationMin ?? null,
          capacity: item.capacity ?? null,
          imageUrl: null,
          isActive: true,
          position: index + 1,
        });
      });
    }
    setSitePublished(db, tenant, true);

    if (listSiteRequests(db).length === 0) {
      const items = listSiteItems(db);
      const today = todayInTimeZone(config.workspaceTimezone);
      for (const request of site.requests) {
        const requestedDate =
          request.daysAhead == null ? null : addDays(today, request.daysAhead);
        const checkOut =
          requestedDate != null && request.nights != null
            ? addDays(requestedDate, request.nights)
            : null;
        const result = createSiteRequest(db, tenant, {
          guestName: request.guestName,
          phone: request.phone,
          email: request.email ?? null,
          requestedDate,
          requestedTime: request.requestedTime ?? null,
          checkOut,
          guests: request.guests ?? null,
          itemId:
            request.itemIndex == null
              ? null
              : (items[request.itemIndex]?.id ?? null),
          comment: request.comment ?? null,
        });
        if (request.status && request.status !== 'new') {
          const created = listSiteRequests(db).find(
            (item) => item.code === result.code,
          );
          if (created) updateSiteRequestStatus(db, created.id, request.status);
        }
      }
    }
  }
}
