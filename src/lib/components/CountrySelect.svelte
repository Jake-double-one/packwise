<script lang="ts">
	import { countryFlag, sortedCountries } from '$lib/data/countries';
	import { useI18n } from '$lib/i18n';

	let { name = 'country', value = $bindable(''), required = false, id = name }: { name?: string; value?: string; required?: boolean; id?: string } = $props();
	const i18n = useI18n();
	const countries = $derived(sortedCountries(i18n.locale));
</script>

<select {name} {id} bind:value {required}>
	<option value="">{i18n.t('common.choose_country')}</option>
	{#each countries as c}
		<option value={c.code}>{countryFlag(c.code)} {c.name}</option>
	{/each}
</select>
