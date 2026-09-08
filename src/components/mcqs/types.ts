export type McqChoice = {
	id: string;
	body: string;
	isCorrect: boolean;
	position: number;
};

export type McqListItem = {
	id: string;
	name: string;
	question: string;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};

export type Mcq = McqListItem & {
	choices: McqChoice[];
};
