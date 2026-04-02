import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GenerateSeoDto } from './generate-seo.dto';

describe('GenerateSeoDto', () => {
    function toDto(obj: Record<string, unknown>) {
        return plainToInstance(GenerateSeoDto, obj);
    }

    it('should pass with valid data', async () => {
        const dto = toDto({
            product_name: 'iPhone 15 Pro',
            category: 'Смартфоны',
            keywords: 'apple, iphone',
        });

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('should fail when product_name is empty', async () => {
        const dto = toDto({
            product_name: '',
            category: 'Test',
            keywords: 'test',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('product_name');
    });

    it('should fail when product_name is missing', async () => {
        const dto = toDto({
            category: 'Test',
            keywords: 'test',
        });

        const errors = await validate(dto);
        const props = errors.map((e) => e.property);
        expect(props).toContain('product_name');
    });

    it('should fail when category is missing', async () => {
        const dto = toDto({
            product_name: 'Test',
            keywords: 'test',
        });

        const errors = await validate(dto);
        const props = errors.map((e) => e.property);
        expect(props).toContain('category');
    });

    it('should fail when keywords is missing', async () => {
        const dto = toDto({
            product_name: 'Test',
            category: 'Test',
        });

        const errors = await validate(dto);
        const props = errors.map((e) => e.property);
        expect(props).toContain('keywords');
    });

    it('should fail when all fields are missing', async () => {
        const dto = toDto({});

        const errors = await validate(dto);
        expect(errors).toHaveLength(3);
    });

    it('should fail when product_name is not a string', async () => {
        const dto = toDto({
            product_name: 123,
            category: 'Test',
            keywords: 'test',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});
