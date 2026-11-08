"""Persisted execution consent and transparent, assumption-based planning estimates."""
import math


def estimate_plan(plan,provider,usage,max_iterations,current_cap,source_characters=0):
    workers=len(plan.tasks)
    researchers=sum('web_research' in task.tools for task in plan.tasks)
    calls=workers*2+researchers+2
    # Heuristic workload, not a provider quote or an observed completion time.
    input_tokens=calls*(12000+math.ceil(source_characters/2))+researchers*16000
    output_tokens=workers*5000+researchers*4000+8600
    additional=(input_tokens*provider.input_price+output_tokens*provider.output_price)/1_000_000+researchers*.02
    spent=usage['estimated_cost_usd']
    low=round(spent+additional*.7,4);high=round(spent+additional*1.8,4)
    recommended=min(provider.limits.max_budget_usd,max(current_cap,math.ceil(high*100)/100))
    return {'planning_usage':usage,'current_total_limit_usd':current_cap,
        'estimated_total_low_usd':low,'estimated_total_high_usd':high,
        'recommended_total_limit_usd':recommended,'server_ceiling_usd':provider.limits.max_budget_usd,
        'estimated_seconds_low':calls*5,'estimated_seconds_high':calls*30,
        'execution_timeout_seconds':provider.limits.mission_timeout,
        'expected_additional_calls':calls,'maximum_calls':provider.limits.max_calls,
        'maximum_reported_tokens':provider.limits.token_budget,'max_cycles_per_worker':max_iterations,
        'assumptions':{'input_tokens_per_call':12000,'output_tokens_per_worker':5000,
            'search_input_tokens':16000,'search_allowance_usd':.02,'seconds_per_call_low':5,'seconds_per_call_high':30,
            'input_usd_per_million':provider.input_price,'output_usd_per_million':provider.output_price},
        'estimate_basis':'Heuristic for one worker cycle, one review per worker, bounded searches, commander improvement and final approval. Up to one additional commander improvement/review cycle may be needed. Retries, long artifacts and provider latency can increase cost and time. Configured model rates are used; this is not a price quote or a billing guarantee.',
        'time_limit_risk':calls*30>provider.limits.mission_timeout,
        'budget_risk':high>provider.limits.max_budget_usd}
