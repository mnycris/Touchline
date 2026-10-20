// The identity check behind manager portraits, on descriptions written the way Wikipedia writes them.
// npx tsx scripts/qa/manager-photos.ts
import { managerMatches } from '../../src/domain/identity'
let fails = 0
const t = (want: boolean, d: string, e: string, nation?: string, clubs: string[] = []) => {
  const got = managerMatches(d, e, nation, clubs)
  if (got !== want) fails++
  console.log(`${got === want ? 'ok  ' : 'FAIL'} ${want ? 'accept' : 'reject'}: "${d}" (${nation || 'no nationality'})`)
}
t(true, 'Spanish football manager (born 1982)', 'Mikel Arteta Amatriain is a Spanish professional football manager and former player who is the manager of Premier League club Arsenal.', 'Spain', ['Arsenal'])
t(true, 'Spanish footballer and manager', 'He is the head coach of Barcelona.', 'Spain', ['FC Barcelona'])
t(true, 'Football manager', 'Xabier Alonso Olano is a Spanish professional football manager and former player.', 'Spain')
t(true, 'Italian football manager and former player', 'He is the manager of Juventus.', 'Italy', ['Juventus'])
t(true, 'Association football manager', 'He is the head coach of Bayern Munich.', 'Belgium', ['Bayern Munich'])
t(false, 'American football coach', 'He is the head coach of the Chicago Bears of the National Football League.', 'United States')
t(false, 'Australian rules footballer', 'He played for Collingwood.', 'Australia')
t(false, 'English footballer (born 1994)', 'He is a defender who plays for Stoke City.', 'Spain', ['Real Betis'])
t(false, 'Brazilian politician', 'He was mayor of São Paulo.', 'Brazil')
t(false, 'Portuguese football manager', 'He coaches in the Primeira Liga.', 'Brazil', ['Flamengo'])
t(true, 'Portuguese football manager', 'He is the head coach of Flamengo.', 'Brazil', ['Flamengo'])
t(false, 'German rugby union coach', 'A coach.', 'Germany')
t(true, 'Football manager', 'A coach.', undefined)
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
