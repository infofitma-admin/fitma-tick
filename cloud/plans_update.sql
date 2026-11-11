-- Align the plans table with fitma.lk pricing (monthly USD; billed annually -20%)
update plans set name='Starter', price_monthly_usd=2.99,
  features='{"time_tracking":true,"activity":true,"screenshots":true,"timesheets":true}'::jsonb,
  active=true where code='starter';

update plans set name='Pro', price_monthly_usd=3.99,
  features='{"attendance":true,"breaks":true,"app_url":true,"idle":true,"csv":true,"reports":"advanced"}'::jsonb,
  active=true where code='pro';

insert into plans(code,name,price_monthly_usd,features,active)
  values ('business','Business',4.49,
    '{"approvals":true,"payroll":true,"screenshot_freq":true,"priority":true}'::jsonb, true)
  on conflict (code) do update set
    name=excluded.name, price_monthly_usd=excluded.price_monthly_usd,
    features=excluded.features, active=true;

-- retire the old Enterprise placeholder (keep Fitma internal/free untouched)
update plans set active=false where code='enterprise';

select code, name, price_monthly_usd, active from plans order by price_monthly_usd;
