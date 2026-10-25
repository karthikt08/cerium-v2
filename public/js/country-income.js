// World Bank FY2027 snapshot, retrieved 2026-10-25. Deliberately pinned: annual
// classification changes require a reviewed release, never a live price change.
// https://datahelpdesk.worldbank.org/knowledgebase/articles/906519-world-bank-country-and-lending-groups
export const INCOME_CLASSIFICATION_VERSION='world-bank-fy2027';
export const INCOME_GROUPS=Object.freeze({
  low:'AF BF BI CF TD CD ER ET GM GW KP LR MG MW ML MZ NE RW SL SO SS SD SY UG YE'.split(' '),
  lowerMiddle:'AO BD BJ BT BO KH CM KM CG CI DJ EG SZ GH GN HT HN IN KE KI KG LA LB LS MR MA MM NA NP NI NG PK PG ST SN SB TJ TZ TL TG TN UZ VU VE PS ZM ZW'.split(' '),
  upperMiddle:'AL DZ AR AM AZ BY BZ BA BW BR CV CN CO CU DM DO EC SV GQ FJ GA GE GD GT ID IR IQ JM JO KZ XK LY MY MV MH MU MX FM MD MN ME MK PY PE PH WS RS ZA LK LC VC SR TH TO TR TM TV UA VN'.split(' '),
  high:'AS AD AG AW AU AT BS BH BB BE BM VG BN BG CA KY GG JE CL CR HR CW CY CZ DK EE FO FI FR PF DE GI GR GL GU GY HK HU IS IE IM IL IT JP KR KW LV LI LT LU MO MT MC NR NL NC NZ MP NO OM PW PA PL PT PR QA RO RU SM SA SC SG SX SK SI ES KN MF SE CH TW TT TC AE GB US UY VI'.split(' '),
});
const lookup=new Map();
for(const [group,countries] of Object.entries(INCOME_GROUPS)){
  Object.freeze(countries);
  for(const country of countries){
    if(lookup.has(country))throw new Error('Duplicate income classification: '+country);
    lookup.set(country,group);
  }
}
export const incomeGroup=country=>lookup.get(country)||'unclassified';
export const INCOME_PRICES=Object.freeze({high:20,upperMiddle:16,lowerMiddle:12,low:8,unclassified:20});
