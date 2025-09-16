// Generic Utility Types
export type TNumberOrString = number | string;
export type TNullOrUndefined = null | undefined;
export type TUnknownOrAny = unknown | any;
export type TPromise<Type> = Promise<Type>;
export type TArray<Type> = Array<Type>;
export type TNullable<Type> = Type | null;
export type TOptional<Type> = Type | undefined;
export type TMaybe<Type> = Type | null | undefined;
export type TRecord<Key extends string | number | symbol, Value> = Record<
  Key,
  Value
>;
export type TPartial<Type> = Partial<Type>;
export type TRequired<Type> = Required<Type>;
export type TReadonly<Type> = Readonly<Type>;

export type TObject<
  Key extends string = string,
  Type = TNumberOrString | TNullOrUndefined | TUnknownOrAny,
> = Record<Key, Type | TArray<Type> | Record<Key, Type>>;

// Function Types
export type TFunction<TArgs extends unknown[], TReturn> = (
  ...args: TArgs
) => TReturn;

export type TAsyncFunction<TArgs extends unknown[], TReturn> = (
  ...args: TArgs
) => Promise<TReturn>;

export type TVoidFunction<TArgs extends unknown[]> = (...args: TArgs) => void;
