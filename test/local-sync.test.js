import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Windows local sync is opt-in and schedules only main fast-forward updates',()=>{
  const ps=read('scripts/local-sync.ps1');
  const readme=read('README.md');
  for(const token of [
    '[switch]$Install','[switch]$Remove','[switch]$Status',
    'Register-ScheduledTask','New-ScheduledTaskTrigger','-RepetitionInterval (New-TimeSpan -Minutes 1)',
    'New-ScheduledTaskPrincipal','-LogonType Interactive',
    'status --porcelain --untracked-files=normal',
    'merge-base --is-ancestor HEAD origin/main',
    'merge --ff-only --quiet origin/main',
    'branch --show-current',
  ])assert.ok(ps.includes(token),'missing sync safety/control '+token);
  assert.match(ps,/\$changes\.Count -gt 0\) \{ return \}/,'never overwrite local edits');
  assert.match(ps,/\-ne 'main'\) \{ return \}/,'do not switch a working branch');
  assert.doesNotMatch(ps,/git[^\n]*(?:reset|rebase|clean -f|push|--force)/,'never destructively modify work');
  assert.match(readme,/local-sync\.ps1 -Install/);
  assert.match(readme,/local-sync\.ps1 -Remove/);
  assert.match(readme,/npm run dev/);
});

test('sync leaves secrets, billing data and user browser state alone',()=>{
  const ps=read('scripts/local-sync.ps1');
  assert.doesNotMatch(ps,/Get-Content[^\n]*\.env|Set-Content[^\n]*\.env|Remove-Item[^\n]*data|ConvertFrom-Json|\bAPI\./i,'script should not access business or session data');
  assert.doesNotMatch(ps,/sessionStorage|localStorage|Invoke-RestMethod|Invoke-WebRequest/);
  assert.match(ps,/\$env:LOCALAPPDATA/,'local operational log is outside the repo');
});
