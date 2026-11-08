"""Observable local computations. Each yielded value was computed before publication."""


def tool_steps(scenario, role, inputs):
    if not inputs:
        if scenario in ('weather', 'failure'):
            output = {'label': 'Synthetic weather · not a real forecast',
                      'temperatures': [27, 29, 28, 30, 31, 29],
                      'days': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']}
            yield 'Read the local classroom fixture: six temperatures and six day labels.', 'Read fixture', output
        elif scenario == 'data':
            output = {'scores': [68, 75, 81, 92, 84], 'label': 'Synthetic student dataset'}
            yield 'Read five scores from the local classroom fixture.', 'Read fixture', output
        else:
            output = {'lesson': 'An agent combines instructions, context, permitted tools and control logic. Creating an agent does not train a model.'}
            yield 'Read the curated explanation from the local lesson fixture.', 'Read fixture', output
        return

    source = inputs[0]
    if role == 'Analysis':
        scores = source['scores']
        total = sum(scores)
        yield f'Add the five scores: {" + ".join(map(str, scores))} = {total}.', 'Add scores', {'scores': scores, 'sum': total}
        count = len(scores)
        yield f'Count the scores: {count} values.', 'Count values', {'count': count}
        mean = total / count
        yield f'Divide the total by the count: {total} ÷ {count} = {mean:g}.', 'Calculate average', {**source, 'sum': total, 'count': count, 'mean': mean}
    elif role == 'Visualization':
        rows = [{'day': day, 'temperature': value} for day, value in zip(source['days'], source['temperatures'], strict=True)]
        yield 'Pair each day with its temperature to create six chart rows.', 'Build chart rows', {**source, 'rows': rows}
    elif role == 'Verification':
        if 'temperatures' in source:
            valid = len(source['temperatures']) == len(source['days']) == len(source['rows']) == 6
            valid = valid and all(row['day'] == day and row['temperature'] == temp for row, day, temp in zip(source['rows'], source['days'], source['temperatures'], strict=True))
            checks = [{'check': 'Six days and six observations', 'passed': valid}, {'check': 'Chart rows match the original values', 'passed': valid}]
            summary = 'Check the row count and compare every chart row with the source data.'
        else:
            expected = sum(source['scores']) / len(source['scores'])
            valid = abs(source['mean'] - expected) < 0.001
            checks = [{'check': f'Recalculated average: {expected:g}', 'passed': valid}]
            summary = f'Recalculate from the received scores: {sum(source["scores"])} ÷ {len(source["scores"])} = {expected:g}. Compare with {source["mean"]:g}.'
        if not valid:
            raise ValueError('Output verification failed')
        yield summary, 'Verify result', {**source, 'checks': checks, 'verified': True}
    else:
        # A local formatting operation, not a generated LLM explanation.
        sections = [sentence.strip() + '.' for sentence in source['lesson'].split('.') if sentence.strip()]
        yield 'Split the curated explanation into readable sentences.', 'Format explanation', {**source, 'sections': sections}
