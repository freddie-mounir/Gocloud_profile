# Contributing to GoCloud Website

First off, thank you for considering contributing to GoCloud Website! 🎉

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and what behavior you expected**
- **Include screenshots if possible**
- **Include your environment details** (OS, browser, Node version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List some examples of how the enhancement would be used**

### Pull Requests

1. **Fork the repo** and create your branch from `enhancement/improvements`
2. **Make your changes** following our code style guidelines
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Write meaningful commit messages**
6. **Submit a pull request**

## Development Process

### Setup

```bash
git clone https://github.com/freddie-mounir/Gocloud_profile.git
cd Gocloud_profile
git checkout enhancement/improvements
npm install
npm run dev
```

### Coding Style

- **JavaScript**: Follow ESLint rules (`.eslintrc.js`)
- **CSS**: Use BEM methodology where applicable
- **Pug**: Keep templates clean and modular
- **Formatting**: Use Prettier (run `npm run format`)

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add dark mode toggle
fix: resolve mobile menu z-index issue
docs: update installation instructions
style: format code with prettier
refactor: simplify contact form validation
test: add lighthouse tests
chore: update dependencies
```

### Testing

Before submitting a PR, ensure:

- [ ] Code passes linting (`npm run lint`)
- [ ] Code is properly formatted (`npm run format:check`)
- [ ] Build completes successfully (`npm run build:prod`)
- [ ] All pages render correctly
- [ ] Mobile responsiveness is maintained
- [ ] No console errors

### Documentation

- Update README.md if you change functionality
- Comment complex code logic
- Update CHANGELOG.md (if it exists)
- Add JSDoc comments for new functions

## Project Structure

```
Gocloud_profile_project/
├── views/          # Pug templates
├── components/     # Reusable components
├── css/            # Stylesheets
├── js/             # JavaScript files
├── images/         # Image assets
└── fonts/          # Web fonts
```

## Code Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, your PR will be merged
4. Your contribution will be acknowledged!

## Community

- Be respectful and constructive
- Help others when you can
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)

## Questions?

Feel free to open an issue with the `question` label or contact us at info@gocloud.com

Thank you for contributing! 🚀
