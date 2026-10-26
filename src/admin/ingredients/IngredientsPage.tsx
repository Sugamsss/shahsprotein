import React, { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { addIngredients, countIngredient, getIngredients, uncountIngredient } from '../api';
import { istDateValue } from '../format';
import { dayShort } from '../journal/model';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import { dueOf } from '../todos/model';
import { loadPeople } from '../todos/people';
import { TodoSheet } from '../todos/TodoSheet';
import { useToast } from '../toast';
import type { Ingredient, IngredientBook } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';
import { CountSheet, IngredientSheet } from './IngredientSheets';
import { batchesLeft, fillShare, formatAmount, productIngredientNames, splitLow } from './model';

const copy = adminCopy.ingredients;

type Sheet = { kind: 'edit'; ingredient: Ingredient | null } | { kind: 'count'; ingredient: Ingredient } | { kind: 'buy'; ingredient: Ingredient };

const productName = (id: string) => productsData.find((p) => p.id === id)?.name ?? id;

const Row: React.FC<{
  ingredient: Ingredient;
  book: IngredientBook;
  me: string;
  today: string;
  onSheet: (sheet: Sheet) => void;
}> = ({ ingredient: i, book, me, today, onSheet }) => {
  const left = batchesLeft(i, book.batches);
  const notes = [
    left ? copy.batchesLeft(left.batches, productName(left.productId)) : null,
    i.last_bought_on ? copy.boughtOn(dayShort(i.last_bought_on, today)) : null,
    i.counted_at ? copy.countedOn(dayShort(istDateValue(i.counted_at), today)) : null,
  ].filter(Boolean) as string[];
  const buying = i.buying;
  const buyer = buying ? (buying.assignee ? (buying.assignee.id === me ? adminCopy.todos.you : buying.assignee.name ?? '') : null) : null;
  const when = buying ? dueOf(buying, today).text : null;
  return (
    <div className={`adm-ing${i.low ? ' is-low' : ''}`}>
      <div className="adm-ing__top">
        <span className="adm-ing__name">{i.name}{i.low && <span className="adm-pill adm-pill--warn">{copy.low}</span>}</span>
        <b className="adm-ing__amount">{i.stock === null ? copy.notCounted : formatAmount(i.stock, i.unit)}</b>
      </div>
      {i.stock !== null && <span className="adm-ing__track" aria-hidden="true"><i style={{ '--w': `${fillShare(i)}%` } as React.CSSProperties} /></span>}
      {notes.length > 0 && <p className="adm-ing__notes">{notes.join(' · ')}</p>}
      {i.stock !== null && i.stock < 0 && <p className="adm-ing__notes">{copy.drift}</p>}
      {buying && <p className="adm-ing__notes adm-ing__buying">{buyer ? copy.buying(buyer, when) : copy.eitherBuying(when)}</p>}
      <div className="adm-ing__acts">
        <button type="button" className="adm-text-btn" onClick={() => onSheet({ kind: 'count', ingredient: i })}>{copy.count}</button>
        <button type="button" className="adm-text-btn" aria-label={copy.editLabel(i.name)} onClick={() => onSheet({ kind: 'edit', ingredient: i })}>
          <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />{copy.edit}
        </button>
        {i.low && !buying && (
          <button type="button" className="adm-text-btn" onClick={() => onSheet({ kind: 'buy', ingredient: i })}>
            <Plus size={18} aria-hidden="true" />{copy.askBuy(i.name)}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Ingredients (from Products): what's in the kitchen. Buying (a journal line that names an
 * ingredient) adds to it, Log cooking takes what each kilo uses, and a count by hand sets
 * it right. The ones running low come first, each with a way to put buying it on the to-do list.
 */
const IngredientsPage: React.FC = () => {
  const book = useRpc(getIngredients, [], { refreshOnFocus: true });
  const run = useUndoable();
  const toast = useToast();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [people, setPeople] = useState<{ me: string; other: string | null }>({ me: '', other: null });
  const [adding, setAdding] = useState(false);
  const today = istDateValue();
  useEffect(() => {
    loadPeople().then((p) => setPeople({ me: p.me, other: p.people.filter((x) => x.id !== p.me).length === 1 ? p.people.find((x) => x.id !== p.me)?.id ?? null : null }), () => undefined);
  }, []);

  const count = async (ingredient: Ingredient, amount: number) => {
    let countId = '';
    await run({
      apply: () => () => undefined,
      save: async () => {
        const next = await countIngredient(ingredient.id, amount);
        countId = next.count_id ?? '';
        book.setData(next);
      },
      text: () => copy.counted(ingredient.name, formatAmount(amount, ingredient.unit)),
      undo: () => void (countId && uncountIngredient(countId).then(book.setData, () => toast.error())),
    });
  };

  const fromProducts = async () => {
    setAdding(true);
    try {
      book.setData(await addIngredients(productIngredientNames(productsData.map((p) => p.ingredients))));
      toast.show({ text: copy.addedFromProducts });
    } catch {
      toast.error(() => void fromProducts());
    }
    setAdding(false);
  };

  const data = book.data;
  let body: React.ReactNode;
  if (book.error?.kind === 'missing') body = <p className="adm-card adm-empty">{adminCopy.journal.missing}</p>;
  else if (book.error && !data) body = <LoadError onRetry={() => void book.reload()} />;
  else if (!data) body = <Skeleton cards={2} rows={3} />;
  else if (!data.ingredients.length) {
    body = (
      <section className="adm-card adm-stack">
        <p className="adm-muted">{copy.empty}</p>
        <div className="adm-ing__empty">
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" disabled={adding} onClick={() => void fromProducts()}>{copy.fromProducts}</button>
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" onClick={() => setSheet({ kind: 'edit', ingredient: null })}>{copy.add}</button>
        </div>
      </section>
    );
  } else {
    const { low, rest } = splitLow(data.ingredients);
    body = (
      <>
        <div>
          <p className="adm-home__lede adm-ing__lede">{low.length ? copy.lowLede(low.map((i) => i.name)) : copy.allGood}</p>
        </div>
        {low.length > 0 && (
          <section className="adm-card adm-ings" aria-label={copy.runningLow}>
            {low.map((i) => <Row key={i.id} ingredient={i} book={data} me={people.me} today={today} onSheet={setSheet} />)}
          </section>
        )}
        {rest.length > 0 && (
          <section className="adm-card adm-ings" aria-labelledby="adm-ings-rest">
            <div className="adm-home__head adm-ings__head"><h2 id="adm-ings-rest">{low.length ? copy.enough : copy.title}</h2></div>
            {rest.map((i) => <Row key={i.id} ingredient={i} book={data} me={people.me} today={today} onSheet={setSheet} />)}
          </section>
        )}
      </>
    );
  }

  return (
    <div className="adm-page adm-page--list">
      <div className="adm-title-row">
        <div className="adm-ing__title">
          <AdminLink to="/admin/products" className="adm-jround adm-jround--44" aria-label={copy.back}><ArrowLeft size={20} aria-hidden="true" /></AdminLink>
          <h1 className="adm-title">{copy.title}</h1>
        </div>
        {data && data.ingredients.length > 0 && (
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => setSheet({ kind: 'edit', ingredient: null })}>
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />{copy.add}
          </button>
        )}
      </div>
      <p className="adm-intro">{copy.intro}</p>
      {body}
      {sheet?.kind === 'edit' && data && (
        <IngredientSheet ingredient={sheet.ingredient} products={data.products} onClose={() => setSheet(null)} onSaved={book.setData} />
      )}
      {sheet?.kind === 'count' && (
        <CountSheet ingredient={sheet.ingredient} onClose={() => setSheet(null)} onCount={(amount) => count(sheet.ingredient, amount)} />
      )}
      {sheet?.kind === 'buy' && (
        <TodoSheet todo={null} onClose={() => setSheet(null)} onSaved={() => void book.reload()}
          start={{ text: copy.buyText(sheet.ingredient.name), ingredient: { id: sheet.ingredient.id, name: sheet.ingredient.name }, assignee: people.other }} />
      )}
    </div>
  );
};

export default IngredientsPage;
