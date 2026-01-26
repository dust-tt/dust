import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import KaTeX from 'katex';

export default (Component, { displayMode }) => {
  const sumFormula = '\\sum_0^\\infty';
  const integralFormula = '\\int_{-infty}^\\infty';
  const invalidCommandFormula = '\\inta';
  const incompleteFormula = '\\sum_{';
  const renderError = (error) => <span className="error">{`${error.name}: Cannot render this formula`}</span>;

  const getReactKatexElement = () => screen.getByTestId('react-katex');

  const expectToContainCustomError = (container, customError) =>
    expect(container.querySelector('.error')).toContainHTML(customError);

  const expectToContain = (content) => expect(getReactKatexElement()).toContainHTML(content);

  const expectToContainFormula = (formula) => expectToContain(KaTeX.renderToString(formula, { displayMode }));

  describe('when passing the formula as props', () => {
    it('renders correctly', () => {
      render(<Component math={sumFormula} />);

      expectToContainFormula(sumFormula);
    });

    it('updates after props are updated', () => {
      const { rerender } = render(<Component math={sumFormula} />);

      rerender(<Component math={integralFormula} />);

      expectToContainFormula(integralFormula, { displayMode });
    });
  });

  describe('when passing the formula as child', () => {
    it('renders correctly', () => {
      render(<Component>{integralFormula}</Component>);

      expectToContainFormula(integralFormula);
    });

    it('updates after props are updated', () => {
      const { rerender } = render(<Component>{integralFormula}</Component>);

      rerender(<Component>{sumFormula}</Component>);

      expectToContainFormula(sumFormula);
    });
  });

  describe('error handling', () => {
    it('updates when passing from invalid to valid formula', () => {
      const { rerender } = render(<Component math={invalidCommandFormula} renderError={renderError} />);

      rerender(<Component math={integralFormula} renderError={renderError} />);

      expectToContainFormula(integralFormula);
    });

    it('updates when passing from valid to invalid formula', () => {
      const { rerender, container } = render(<Component math={integralFormula} renderError={renderError} />);

      rerender(<Component math={invalidCommandFormula} renderError={renderError} />);

      expectToContainCustomError(container, '<span class="error">ParseError: Cannot render this formula</span>');
    });

    describe('when using default error handler', () => {
      it('renders the formula with the wrong part highlighted in default color', () => {
        render(<Component math={invalidCommandFormula} />);

        expect(getReactKatexElement().innerHTML).toContain('color:#cc0000;');
      });

      describe('when passing custom error color', () => {
        it('renders the formula with the wrong part highlighted in custom color', () => {
          render(<Component errorColor={'blue'} math={invalidCommandFormula} />);

          expect(getReactKatexElement().innerHTML).toContain('color:blue;');
        });
      });

      describe('when error is caused by an invalid prop type', () => {
        beforeEach(() => {
          // disable console.error doen by prop-types
          jest.spyOn(console, 'error').mockImplementation(() => null);
        });

        it('renders error message', () => {
          render(<Component displayMode math={123} />);

          expectToContain('KaTeX can only parse string typed expression');
        });
      });

      describe('when error is caused while parsing math expression', () => {
        it('renders error message', () => {
          render(<Component math={incompleteFormula} />);

          expectToContain("KaTeX parse error: Expected '}', got 'EOF' at end of input: \\sum_{");
        });
      });
    });

    describe('when using custom error handler', () => {
      it('renders the returned value from `renderError` prop', () => {
        const { container } = render(<Component math={invalidCommandFormula} renderError={renderError} />);

        expectToContainCustomError(container, '<span class="error">ParseError: Cannot render this formula</span>');
      });

      describe('when error is caused while parsing math expression', () => {
        it('still uses custom handler', () => {
          const { container } = render(<Component math={incompleteFormula} renderError={renderError} />);

          expectToContainCustomError(container, '<span class="error">ParseError: Cannot render this formula</span>');
        });
      });
    });
  });
};
