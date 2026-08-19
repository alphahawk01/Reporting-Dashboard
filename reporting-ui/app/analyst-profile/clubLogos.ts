/**
 * Static mapping of club/team names to their PlayHQ Cloudinary logo URLs.
 * The lookup is case-insensitive — keys here should be lowercase.
 * Only one entry per club is needed (suffix matching handles U18s, Reserves, etc.)
 */
export const clubLogos: Record<string, string> = {
  "aberfeldie": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/85e368d3-073c-4df6-a039-c6fe503f03e8/1701737203999/logo.jpg?_a=BAMAMifg0",
  "strathmore": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/e5298688-83bb-43cc-a704-71c3dde63349/1701744764858/logo.jpg?_a=BAMAMifg0",
  "hillside": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/ed3b31aa-0b58-4518-a683-2ab1dd34cf0f/1701737999348/logo.jpg?_a=BAMAMifg0",
  "maribyrnong park": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/ed781162-14de-449b-9700-3fbb1d540533/1706066288090/logo.jpg?_a=BAMAMifg0",
  "deer park": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/dd03772d-8b1c-4216-860a-dd87bd118df2/1701743909749/logo.jpg?_a=BAMAMifg0",
  "keilor": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/0674a9cf-a371-4358-b559-7038a438dd4c/1710937748979/logo.jpg?_a=BAMAMifg0",
  "essendon doutta stars": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/e22e68e5-162b-4db9-84a5-81e4bed092c3/1769043485995/logo.jpg?_a=BAMAMifg0",
  "greenvale": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/fa3b2905-e3c2-4673-9f06-58216ed47350/1701744231158/logo.jpg?_a=BAMAMifg0",
  "pascoe vale": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/4b7425ce-f3e3-493a-8c33-71ca7ab342f9/1701744425515/logo.jpg?_a=BAMAMifg0",
  "airport west": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/917dfb8e-35b3-43a1-8b23-e328be643f6e/1697760092884/logo.png?_a=BAMAMifg0",
  "rowville": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/7ed5ab85-bbf1-4043-83d3-ec007680cccd/1696902270578/logo.png?_a=BAMAMifg0",
  "balwyn": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/ecf51dd3-8039-494e-819a-e66e74250006/1696903509797/logo.png?_a=BAMAMifg0",
  "vermont": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/023ee235-0c0c-4041-864d-099a1e788ffe/1705106044002/logo.png?_a=BAMAMifg0",
  "berwick": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/8f0b64bb-d0bb-4f76-81b8-603d16528c15/1696903266854/logo.png?_a=BAMAMifg0",
  "south belgrave": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/a9a17709-1b1e-42cc-a240-9ef41df48a17/1696902333097/logo.png?_a=BAMAMifg0",
  "blackburn": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/1c7b6fc1-7572-48dd-a91c-fc566c72b338/1696901433953/logo.png?_a=BAMAMifg0",
  "doncaster east": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/a07fe59e-baef-4858-ac2f-a378402ae4e3/1696901772749/logo.png?_a=BAMAMifg0",
  "east ringwood": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/f24f2f00-443a-4eff-a941-1876fe4ed56a/1696901857062/logo.png?_a=BAMAMifg0",
  "south croydon": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/70d6161b-52a9-49f7-a49a-bbb2b17aecd9/1696902354171/logo.png?_a=BAMAMifg0",
  "noble park": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/feb09793-5541-438b-991f-ba353db7d730/1696902122542/logo.png?_a=BAMAMifg0",
  "mitcham": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/b8de26fd-9ecd-4510-92d1-f65ae92d3109/1696902052304/logo.png?_a=BAMAMifg0",
  "park orchards": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/48b2041f-8208-4e2f-95d9-65d4527fa343/1696902226104/logo.png?_a=BAMAMifg0",
  "wantirna south": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/48b2041f-8208-4e2f-95d9-65d4527fa343/1696902226104/logo.png?_a=BAMAMifg0",
  "montrose": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/d3429a03-18e9-4171-a535-4e2a5f48fbea/1696902071422/logo.png?_a=BAMAMifg0",
  "bayswater": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/be1ca5c9-4327-4d94-8a4b-71ac73c85511/1696899718152/logo.png?_a=BAMAMifg0",
  "norwood": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/be1ca5c9-4327-4d94-8a4b-71ac73c85511/1696899718152/logo.png?_a=BAMAMifg0",
  "beaconsfield": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/be1ca5c9-4327-4d94-8a4b-71ac73c85511/1696899718152/logo.png?_a=BAMAMifg0",
  "boronia": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/6267edc4-ee0f-4821-9692-4e90c56a81d4/1696901455313/logo.png?_a=BAMAMifg0",
  "north ringwood": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/9e3ed6a9-276a-4468-aaee-c89205ebe97f/1696902146129/logo.png?_a=BAMAMifg0",
  "mooroolbark": "https://res.cloudinary.com/playhq/image/upload/h_96,w_96/v1/production/afl/34253694-f191-43d7-8d69-672abdfaeecf/1742905649645/logo.jpg?_a=BAMAMifg0",
};
